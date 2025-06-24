import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Image } from 'react-native'
import React, { useState, useEffect, useRef } from 'react'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import * as ImagePicker from 'expo-image-picker'
import { Video, ResizeMode } from 'expo-av'
import { decode } from 'base64-arraybuffer'
import * as FileSystem from 'expo-file-system'
import * as SecureStore from 'expo-secure-store'

// Secure API key storage
const OPENAI_API_KEY_STORAGE = 'openai_api_key'

// Helper function to get API key securely
const getOpenAIKey = async () => {
  // 1. Prefer build-time environment variable if defined (e.g. via .env.local or EAS secrets)
  const envKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY
  if (envKey && envKey.trim()) {
    return envKey.trim()
  }
  try {
    let apiKey = await SecureStore.getItemAsync(OPENAI_API_KEY_STORAGE)
    
    // If no key stored, prompt user to enter it (one-time setup)
    if (!apiKey) {
      Alert.alert(
        'OpenAI API Key Required',
        'Please enter your OpenAI API key to enable AI chat suggestions.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Enter Key', 
            onPress: () => {
              Alert.prompt(
                'OpenAI API Key',
                'Enter your OpenAI API key:',
                async (key) => {
                  if (key) {
                    await SecureStore.setItemAsync(OPENAI_API_KEY_STORAGE, key)
                  }
                },
                'secure-text'
              )
            }
          }
        ]
      )
      return null
    }
    
    return apiKey
  } catch (error) {
    console.error('Error getting OpenAI key:', error)
    return null
  }
}

interface Message {
  id: number
  content: string
  sender_id: string
  created_at: string
  sender_name: string
  is_own_message: boolean
  media_url?: string
  media_type?: string
}

export default function ChatScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>()
  const insets = useSafeAreaInsets()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [chatTitle, setChatTitle] = useState('Chat')
  const flatListRef = useRef<FlatList>(null)
  const [receipts, setReceipts] = useState<Record<number, string[]>>({})
  const [selectedMedia, setSelectedMedia] = useState<Array<{
    id: string
    uri: string
    type: string
    name: string
  }>>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  // Calculate keyboard offset including header height and safe area
  const keyboardOffset = Platform.OS === 'ios' ? insets.top + 20 : 20

  useEffect(() => {
    if (channelId) {
      loadMessages()
      loadChatInfo()
      const subscription = supabase
        .channel(`messages:${channelId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `channel_id=eq.${channelId}`
          },
          async (payload) => {
            const newMessage = payload.new as any
            // We need to get the sender's profile to display their name
            const { data: profile } = await supabase
              .from('profiles')
              .select('username')
              .eq('user_id', newMessage.sender_id)
              .single()
            
            const { data: { user } } = await supabase.auth.getUser()

            setMessages(currentMessages => {
              // Check if message already exists to prevent duplicates
              const messageExists = currentMessages.some(m => m.id === newMessage.id)
              if (messageExists) return currentMessages
              
              return [
                ...currentMessages,
                {
                  id: newMessage.id,
                  content: newMessage.content,
                  sender_id: newMessage.sender_id,
                  created_at: newMessage.created_at,
                  sender_name: profile?.username || 'Unknown',
                  is_own_message: newMessage.sender_id === (user?.id || ''),
                  media_url: newMessage.media_url,
                }
              ]
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'messages'
          },
          (payload) => {
            const deletedMessage = payload.old as any
            
            setMessages(currentMessages => {
              // Check if this message exists in the current messages (using fresh state)
              const messageExistsInChat = currentMessages.some(m => String(m.id) === String(deletedMessage.id))
              
              if (!messageExistsInChat) {
                return currentMessages // Return unchanged
              }
              
              // Filter out the deleted message
              const filteredMessages = currentMessages.filter(m => {
                const currentId = String(m.id)
                const deletedId = String(deletedMessage.id)
                return currentId !== deletedId
              })
              return filteredMessages
            })
            
            // Also remove read receipts for the deleted message
            setReceipts(prev => {
              const newReceipts = { ...prev }
              delete newReceipts[deletedMessage.id]
              return newReceipts
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'message_reads'
          },
          (payload) => {
            const readData = payload.new as any
            setReceipts(prev => ({
              ...prev,
              [readData.message_id]: [...(prev[readData.message_id] || []), readData.reader_id]
            }))
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'message_reads'
          },
          (payload) => {
            const deletedRead = payload.old as any
            setReceipts(prev => {
              const newReceipts = { ...prev }
              if (newReceipts[deletedRead.message_id]) {
                newReceipts[deletedRead.message_id] = newReceipts[deletedRead.message_id].filter(
                  readerId => readerId !== deletedRead.reader_id
                )
                // If no more readers for this message, remove the entry
                if (newReceipts[deletedRead.message_id].length === 0) {
                  delete newReceipts[deletedRead.message_id]
                }
              }
              return newReceipts
            })
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(subscription)
      }
    }
  }, [channelId])

  const loadChatInfo = async () => {
    try {
      const { data, error } = await supabase.rpc('get_chat_details', { p_channel_id: channelId })

      if (error) {
        // Check if the error is due to access denied (user no longer in chat)
        if (error.message.includes('Access denied') || error.message.includes('not a member')) {
          return // Silently fail for chat info, the main error will be caught in loadMessages
        }
        throw error
      }

      const { is_group, participants } = data
      if (is_group) {
        setChatTitle(participants?.map((p: any) => p.username).join(', ') || 'Group')
      } else {
        setChatTitle(participants?.[0]?.username || 'Chat')
      }
    } catch (error) {
      console.error('Error loading chat info:', error)
      // Don't show an alert here since loadMessages will handle the main error
    }
  }

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase.rpc('get_chat_messages', { p_channel_id: channelId })
      
      if (error) {
        // Check if the error is due to access denied (user no longer in chat)
        if (error.message.includes('Access denied') || error.message.includes('not a member')) {
          Alert.alert(
            'Chat Unavailable',
            'You are no longer a member of this chat.',
            [{ 
              text: 'OK', 
              onPress: () => router.back() 
            }]
          )
          return
        }
        throw error
      }

      setMessages(data || [])
      
      // Load read receipts for messages
      if (data && data.length > 0) {
        const messageIds = data.map((m: any) => m.id)
        const { data: reads } = await supabase
          .from('message_reads')
          .select('message_id, reader_id')
          .in('message_id', messageIds)
        
        const receiptsMap: Record<number, string[]> = {}
        reads?.forEach((r: any) => {
          receiptsMap[r.message_id] = [...(receiptsMap[r.message_id] || []), r.reader_id]
        })
        setReceipts(receiptsMap)
      }
    } catch (error) {
      console.error('Error loading messages:', error)
      Alert.alert(
        'Error',
        'Unable to load chat messages. You may no longer have access to this chat.',
        [{ 
          text: 'OK', 
          onPress: () => router.back() 
        }]
      )
    } finally {
      setLoading(false)
    }
  }

  const subscribeToMessages = () => {
    // This is now handled in the useEffect hook directly
  }

  const sendMessage = async () => {
    if ((!newMessage.trim() && selectedMedia.length === 0) || sending) return

    const messageText = newMessage.trim()
    setNewMessage('') // Clear input immediately for better UX

    try {
      setSending(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Send text message if there's text
      if (messageText) {
        const { data, error } = await supabase
          .from('messages')
          .insert({
            channel_id: channelId,
            sender_id: user.id,
            content: messageText,
          })
          .select()
        
        if (error) {
          // Restore message text on error
          setNewMessage(messageText)
          // Check if error is due to RLS policy (user not in channel)
          if (error.message.includes('policy') || error.message.includes('denied')) {
            Alert.alert(
              'Unable to Send',
              'You are no longer a member of this chat.',
              [{ 
                text: 'OK', 
                onPress: () => router.back() 
              }]
            )
            return
          }
          throw error
        }
      }

      // Send media messages
      for (const media of selectedMedia) {
        await uploadAndSendMedia(media, user.id)
      }

      setSelectedMedia([])
    } catch (err) {
      console.error('Error sending message:', err)
      Alert.alert('Error', 'Unable to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const uploadAndSendMedia = async (media: any, userId: string) => {
    const ext = media.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${channelId}/${Date.now()}.${ext}`

    // Read file as base64 and convert to ArrayBuffer
    const base64 = await FileSystem.readAsStringAsync(media.uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    
    const arrayBuffer = decode(base64)

    const { error: uploadError } = await supabase
      .storage
      .from('chat-media')
      .upload(path, arrayBuffer, {
        contentType: media.type.startsWith('video') ? 'video/mp4' : `image/${ext}`
      })

    if (uploadError) throw uploadError

    const { data } = await supabase.storage.from('chat-media').getPublicUrl(path)

    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        sender_id: userId,
        media_url: data.publicUrl,
      })

    if (insertError) throw insertError
  }

  const pickMedia = async () => {
    try {
      if (selectedMedia.length >= 3) {
        Alert.alert('Limit reached', 'You can only attach up to 3 media files at once')
        return
      }

      // Ask for permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Need camera roll permission to send media')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.7,
        allowsMultipleSelection: false
      })

      if (result.canceled) return

      const asset = result.assets[0]
      const fileType = asset.type ?? 'image'
      const fileName = asset.fileName || `media_${Date.now()}.${asset.uri.split('.').pop()}`

      // Add to selected media
      setSelectedMedia(prev => [...prev, {
        id: Date.now().toString(),
        uri: asset.uri,
        type: fileType,
        name: fileName
      }])
    } catch (err) {
      console.error('Error sending media:', err)
      Alert.alert('Upload failed', 'Could not send media')
    }
  }

  const removeMedia = (id: string) => {
    setSelectedMedia(prev => prev.filter(item => item.id !== id))
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const renderMessage = ({ item }: { item: Message }) => (
    <View className={`mb-3 ${item.is_own_message ? 'items-end' : 'items-start'}`}>
      <View className={`max-w-[80%] p-3 rounded-2xl ${
        item.is_own_message 
          ? 'bg-blue-500 rounded-br-md' 
          : 'bg-gray-700 rounded-bl-md'
      }`}>
        {!item.is_own_message && (
          <Text className="text-gray-300 text-xs mb-1 font-semibold">
            {item.sender_name}
          </Text>
        )}

        {/* Media rendering */}
        {item.media_url ? (
          /\.(mp4|mov|webm)$/i.test(item.media_url) ? (
            <Video
              source={{ uri: item.media_url }}
              style={{ width: 200, height: 200 }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
            />
          ) : (
            <Image
              source={{ uri: item.media_url }}
              style={{ width: 200, height: 200, borderRadius: 8 }}
            />
          )
        ) : (
          <Text className="text-white text-base">
            {item.content}
          </Text>
        )}
        <View className="flex-row items-center justify-between mt-1">
          <Text className={`text-xs ${
            item.is_own_message ? 'text-blue-100' : 'text-gray-400'
          }`}>
            {formatTime(item.created_at)}
          </Text>
          {item.is_own_message && (
            <Feather
              name={receipts[item.id]?.length ? 'check-circle' : 'check'}
              size={14}
              color={receipts[item.id]?.length ? '#4ADE80' : '#D1D5DB'}
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
      </View>
    </View>
  )

  // -----------------------------------------------------------------
  // Leave / delete chat (remove current user from channel)
  // -----------------------------------------------------------------
  const leaveChat = async () => {
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return

      const { error } = await supabase
        .from('channel_members')
        .delete()
        .eq('channel_id', channelId)
        .eq('member_id', auth.user.id)

      if (error) {
        console.error('Error leaving chat:', error)
        Alert.alert('Error', 'Unable to leave chat. Please try again.')
        return
      }

      // Broadcast an event to notify other parts of the app that the user left a chat
      supabase.channel('chat-updates').send({
        type: 'broadcast',
        event: 'user-left-chat',
        payload: { userId: auth.user.id, channelId }
      })

      // After leaving, go back to inbox immediately
      router.back()
    } catch (err) {
      console.error('Error leaving chat:', err)
      Alert.alert('Error', 'Unable to leave chat. Please try again.')
    }
  }

  const confirmLeaveChat = () => {
    Alert.alert(
      'Leave this chat?',
      'You will no longer see this conversation in your inbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: leaveChat }
      ]
    )
  }

  // Mark messages as read when they become visible
  const markMessagesAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const unreadMessages = messages.filter(m => 
        !m.is_own_message && 
        !(receipts[m.id]?.includes(user.id))
      )

      if (unreadMessages.length > 0) {
        const reads = unreadMessages.map(m => ({
          message_id: m.id,
          reader_id: user.id
        }))

        await supabase.from('message_reads').insert(reads)
      }
    } catch (error) {
      console.error('Error marking messages as read:', error)
    }
  }

  // Mark as read when messages change or screen gains focus
  useEffect(() => {
    if (messages.length > 0) {
      markMessagesAsRead()
      // Generate suggestions after a short delay to avoid too many API calls
      const timer = setTimeout(() => {
        generateSuggestions()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [messages])

  // Generate AI suggestions based on recent messages
  const generateSuggestions = async () => {
    if (messages.length === 0 || loadingSuggestions) return
    
    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      console.log('❌ No OpenAI API key available')
      return
    }
    
    setLoadingSuggestions(true)
    try {
      // Get the last few messages for context (limit to recent conversation)
      const recentMessages = messages.slice(-5).map(m => 
        `${m.is_own_message ? 'Me' : m.sender_name}: ${m.content}`
      ).join('\n')
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Cheap and fast model
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that suggests 3 short, natural reply options for casual chat conversations. Keep responses brief (1-8 words), friendly, and appropriate for the context. Return only the 3 suggestions separated by newlines, no numbering or extra text.'
            },
            {
              role: 'user',
              content: `Based on this conversation, suggest 3 good reply options:\n\n${recentMessages}`
            }
          ],
          max_tokens: 100,
          temperature: 0.7,
        }),
      })

      const data = await response.json()
      
      if (data.choices && data.choices[0]?.message?.content) {
        const suggestedReplies = data.choices[0].message.content
          .trim()
          .split('\n')
          .filter((s: string) => s.trim().length > 0)
          .slice(0, 3) // Ensure max 3 suggestions
        
        setSuggestions(suggestedReplies)
      }
    } catch (error) {
      console.error('Error generating suggestions:', error)
      // Fallback to simple suggestions if AI fails
      setSuggestions(['👍', 'Sounds good!', 'Thanks!'])
    } finally {
      setLoadingSuggestions(false)
    }
  }

  // Handle suggestion selection
  const selectSuggestion = (suggestion: string) => {
    setNewMessage(suggestion)
    setSuggestions([]) // Hide suggestions after selection
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-black">
        <View className="flex-1 justify-center items-center">
          <Text className="text-white">Loading chat...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center p-4 border-b border-gray-800">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Feather name="arrow-left" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold flex-1">
          {chatTitle}
        </Text>
        <TouchableOpacity onPress={confirmLeaveChat}>
          <Feather name="trash-2" size={22} color="white" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        className="flex-1" 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id.toString()}
          className="flex-1 px-4"
          contentContainerStyle={{ paddingBottom: 10 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Message Input Container */}
        <View className="bg-black border-t border-gray-800">
          {/* AI Suggestions */}
          {suggestions.length > 0 && (
            <View className="px-4 py-2">
              <View className="flex-row items-center mb-2">
                <Feather name="zap" size={14} color="#60A5FA" />
                <Text className="text-blue-400 text-xs ml-1 font-medium">Quick replies</Text>
              </View>
              <View className="flex-row flex-wrap">
                {suggestions.map((suggestion, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => selectSuggestion(suggestion)}
                    className="bg-gray-700 rounded-full px-3 py-2 mr-2 mb-2"
                  >
                    <Text className="text-white text-sm">{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          
          {/* Media Previews */}
          {selectedMedia.length > 0 && (
            <View className="px-4 pt-3 pb-2 bg-black">
              <View className="flex-row flex-wrap">
                {selectedMedia.map((media) => (
                  <View key={media.id} className="relative mr-2 mb-2">
                    <View className="w-16 h-16 bg-gray-700 rounded-lg overflow-hidden">
                      {media.type.startsWith('video') ? (
                        <Video
                          source={{ uri: media.uri }}
                          style={{ width: 64, height: 64 }}
                          resizeMode={ResizeMode.COVER}
                          shouldPlay={false}
                        />
                      ) : (
                        <Image
                          source={{ uri: media.uri }}
                          style={{ width: 64, height: 64 }}
                        />
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => removeMedia(media.id)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full items-center justify-center"
                    >
                      <Feather name="x" size={12} color="white" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Input Row */}
          <View className="flex-row items-center p-4 bg-black">
            {/* Media picker */}
            <TouchableOpacity onPress={pickMedia} className="mr-3">
              <Feather name="plus" size={22} color="white" />
            </TouchableOpacity>

            <View className="flex-1 flex-row items-center bg-gray-800 rounded-full px-4 py-3 mr-3 min-h-[44px]">
              <TextInput
                value={newMessage}
                onChangeText={(text) => {
                  setNewMessage(text)
                  // Clear suggestions when user starts typing
                  if (text.length > 0 && suggestions.length > 0) {
                    setSuggestions([])
                  }
                }}
                placeholder="Type a message..."
                placeholderTextColor="#9CA3AF"
                className="flex-1 text-white text-base"
                multiline
                maxLength={500}
                style={{ minHeight: 20, maxHeight: 100 }}
              />
            </View>
            
            {/* Suggestion refresh button */}
            {!newMessage.trim() && messages.length > 0 && (
              <TouchableOpacity
                onPress={generateSuggestions}
                disabled={loadingSuggestions}
                className="w-11 h-11 rounded-full items-center justify-center bg-gray-700 mr-2"
              >
                <Feather 
                  name={loadingSuggestions ? "loader" : "zap"} 
                  size={18} 
                  color="#60A5FA" 
                />
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              onPress={() => {
                sendMessage()
                setSuggestions([]) // Clear suggestions after sending
              }}
              disabled={(!newMessage.trim() && selectedMedia.length === 0) || sending}
              className={`w-11 h-11 rounded-full items-center justify-center ${
                (newMessage.trim() || selectedMedia.length > 0) && !sending ? 'bg-blue-500' : 'bg-gray-600'
              }`}
            >
              <Feather name="send" size={18} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
} 