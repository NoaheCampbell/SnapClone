import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Image, Modal, TouchableWithoutFeedback, ActivityIndicator } from 'react-native'
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
import SprintCamera from '../../components/SprintCamera'
// @ts-ignore
import EmojiPicker from 'rn-emoji-keyboard'

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
  content: string | null
  media_url?: string | null
  sprint_id?: string | null
  sender_id: string
  created_at: string
  sender_name: string
  is_own_message: boolean
  media_type?: string
  reactions?: { emoji: string; count: number; reactedByMe: boolean }[]
  join_count?: number
}

const REACTIONS = ['👍','🔥','📚'] as const

const emojiDarkTheme = {
  backdrop: 'rgba(0,0,0,0.6)',
  knob: '#4B5563',
  container: '#1F2937',
  header: '#1F2937',
  category: {
    icon: '#9CA3AF',
    iconActive: '#FFFFFF',
    container: '#1F2937',
    containerActive: '#374151'
  },
  search: {
    background: '#374151',
    text: '#FFFFFF',
    placeholder: '#9CA3AF',
    icon: '#D1D5DB'
  },
  emoji: {
    background: '#1F2937',
    emoji: '#FFFFFF'
  }
} as const;

// Add AvatarStack component before main component
const AvatarStack = ({ sprintId, joinCount, fetchAvatars }: { 
  sprintId: string; 
  joinCount: number; 
  fetchAvatars: (id: string) => Promise<string[]>;
}) => {
  const [avatars, setAvatars] = useState<string[]>([]);
  
  useEffect(() => {
    fetchAvatars(sprintId).then(setAvatars);
  }, [sprintId]);
  
  const displayAvatars = avatars.slice(0, 3);
  
  return (
    <View className="flex-row -space-x-2 mr-2">
      {Array.from({ length: Math.min(joinCount, 3) }).map((_, i) => {
        const avatar = displayAvatars[i];
        return avatar ? (
          <Image
            key={i}
            source={{ uri: avatar }}
            className="w-6 h-6 rounded-full border-2 border-gray-900"
          />
        ) : (
          <Image
            key={i}
            source={require('../../../assets/images/avatar-placeholder.png')}
            className="w-6 h-6 rounded-full border-2 border-gray-900"
          />
        );
      })}
    </View>
  );
};

export default function ChatScreen() {
  const params = useLocalSearchParams<{ circleId?: string; channelId?: string }>()
  const channelId = (params.circleId ?? params.channelId) as string | undefined
  const isCircle = !!params.circleId
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
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [availableFriends, setAvailableFriends] = useState<Array<{user_id: string, username: string}>>([])
  const [selectedNewMembers, setSelectedNewMembers] = useState<string[]>([])
  const [addingMembers, setAddingMembers] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null)
  const [reactionsMap, setReactionsMap] = useState<Record<number, {emoji:string; user_id:string}[]>>({})
  const [joinedSprints, setJoinedSprints] = useState<string[]>([])
  const [showThreadModal, setShowThreadModal] = useState(false)
  const [threadMessages, setThreadMessages] = useState<Message[]>([])
  const [threadRootMessage, setThreadRootMessage] = useState<Message | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [showJoinCamera, setShowJoinCamera] = useState(false)
  const [joinSprintData, setJoinSprintData] = useState<{
    sprintId: string;
    circleId: string;
    originalSprint: any;
    username: string;
  } | null>(null)
  const [participantAvatars, setParticipantAvatars] = useState<Record<string, string[]>>({})
  const [threadNewMessage, setThreadNewMessage] = useState('')
  const [sendingThreadMessage, setSendingThreadMessage] = useState(false)

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

            // Only emit root messages (thread_root_id null or equals id)
            if (newMessage.thread_root_id && newMessage.thread_root_id !== newMessage.id) return;

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
                  sprint_id: newMessage.sprint_id,
                  media_type: newMessage.media_type,
                  join_count: newMessage.join_count,
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
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
          },
          (payload) => {
            const updated = payload.new as any;
            
            // Only update if this message belongs to our current chat/circle
            if (updated.channel_id === channelId || updated.circle_id === channelId) {
              setMessages(curr => curr.map(m => m.id === updated.id ? { ...m, join_count: updated.join_count } : m));
              if (updated.join_count > 1 && updated.sprint_id) {
                setJoinedSprints(prev => prev.includes(updated.sprint_id) ? prev : [...prev, updated.sprint_id]);
              }
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(subscription)
      }
    }
  }, [channelId])

  useEffect(() => {
    if (messages.length === 0) return
    const messageIds = messages.map(m => m.id)
    supabase
      .from('message_reactions')
      .select('*')
      .in('message_id', messageIds)
      .then(({ data }) => {
        const map: Record<number, {emoji:string; user_id:string}[]> = {}
        data?.forEach(r => {
          if (!map[r.message_id]) map[r.message_id] = []
          map[r.message_id].push({ emoji: r.emoji, user_id: r.user_id })
        })
        setReactionsMap(map)
      })
  }, [messages])

  useEffect(() => {
    const sub = supabase.channel('message-reactions')
      .on('postgres_changes', { schema:'public', table:'message_reactions', event:'INSERT' }, payload => {
        const r = payload.new as any
        setReactionsMap(prev => {
          const list = [...(prev[r.message_id] || []), { emoji:r.emoji, user_id:r.user_id }]
          return { ...prev, [r.message_id]: list }
        })
      })
      .on('postgres_changes', { schema:'public', table:'message_reactions', event:'UPDATE' }, payload => {
        const r = payload.new as any
        setReactionsMap(prev => {
          const list = (prev[r.message_id] || []).filter(x => x.user_id !== r.user_id)
          list.push({ emoji:r.emoji, user_id:r.user_id })
          return { ...prev, [r.message_id]: list }
        })
      })
      .on('postgres_changes', { schema:'public', table:'message_reactions', event:'DELETE' }, payload => {
        const r = payload.old as any
        setReactionsMap(prev => {
          const list = (prev[r.message_id] || []).filter(x => x.user_id !== r.user_id)
          const newMap = { ...prev, [r.message_id]: list }
          if (list.length === 0) delete newMap[r.message_id]
          return newMap
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [])

  const loadChatInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const functionName = isCircle ? 'get_circle_details' : 'get_chat_details'
      const parameterName = isCircle ? 'p_circle_id' : 'p_channel_id'
      const { data, error } = await supabase.rpc(functionName, { [parameterName]: channelId })

      if (error) {
        // Check if the error is due to access denied (user no longer in chat)
        if (error.message.includes('Access denied') || error.message.includes('not a member')) {
          return // Silently fail for chat info, the main error will be caught in loadMessages
        }
        throw error
      }

      if (isCircle) {
        // For circles, data is a jsonb object with members array
        const members = data?.members || []
        const otherMembers = members.filter((m: any) => m.user_id !== user.id)
        setChatTitle(otherMembers.map((m: any) => m.username).join(', ') || 'Circle')
      } else {
        // For old channels, use the original format
        const { is_group, participants } = data
        if (is_group) {
          // Filter out current user from the title
          const otherParticipants = participants?.filter((p: any) => p.user_id !== user.id) || []
          setChatTitle(otherParticipants.map((p: any) => p.username).join(', ') || 'Group')
        } else {
          // For 1-on-1, show the other person's name
          const otherParticipant = participants?.find((p: any) => p.user_id !== user.id)
          setChatTitle(otherParticipant?.username || 'Chat')
        }
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

      const rootMsgs = (data || []).filter((m: any) => !m.thread_root_id || m.thread_root_id === m.id)
      setMessages(rootMsgs)
      
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
      <TouchableOpacity activeOpacity={0.8} onLongPress={() => openReactionPicker(item.id)}>
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
              <View>
                <Image
                  source={{ uri: item.media_url }}
                  style={{ width: 200, height: 200, borderRadius: 8 }}
                />
                {/* Sprint buttons positioned below the image */}
                {item.sprint_id && (
                  <View className="flex-row justify-center mt-2 items-center space-x-2">
                    {!item.is_own_message && !joinedSprints.includes(item.sprint_id as string) && (
                      <TouchableOpacity
                        className="bg-blue-600 px-3 py-1.5 rounded-full"
                        onPress={() => joinSprint(item.sprint_id as string, channelId as string)}
                      >
                        <Text className="text-white text-xs font-medium">Join Sprint</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            )
          ) : (
            <Text className="text-white text-base">
              {item.content}
            </Text>
          )}
          {/* If sprint message without media (safety) add view button below */}
          {!item.media_url && item.sprint_id && (
            <TouchableOpacity
              className="mt-2 bg-black/20 px-2 py-1 rounded"
              onPress={() => router.push({ pathname: '/(tabs)/sprints', params: { viewSprint: item.sprint_id } })}
            >
              <Text className="text-white text-xs">View Sprint</Text>
            </TouchableOpacity>
          )}
          <View className={`flex-row items-center justify-between ${item.sprint_id && item.media_url ? 'mt-2' : 'mt-1'}`}>
            <Text className={`text-xs ${
              item.is_own_message ? 'text-blue-100' : 'text-gray-400'
            }`}>
              {formatTime(item.created_at)}
            </Text>
            <View className="flex-row items-center">
              {/* Thread counter badge */}
              {item.join_count && item.join_count > 1 && (
                <View className="bg-blue-500/90 px-2 py-0.5 rounded-full mr-2">
                  <Text className="text-white text-xs">{item.join_count}</Text>
                </View>
              )}
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

          {/* Reactions bar */}
          {reactionsMap[item.id] && (
            <View className="flex-row mt-1 space-x-2">
              {Array.from(new Set(reactionsMap[item.id].map(r => r.emoji))).map(e => {
                const list = reactionsMap[item.id].filter(r => r.emoji === e)
                return (
                  <View key={e} className="flex-row items-center bg-black/20 px-1.5 py-0.5 rounded-full">
                    <Text className="text-sm mr-1">{e}</Text>
                    <Text className="text-xs text-white">{list.length}</Text>
                  </View>
                )
              })}
            </View>
          )}

          {/* Thread opener (Discord-style) */}
          {item.sprint_id && item.join_count && item.join_count > 1 && (
            <TouchableOpacity
              className="flex-row items-center mt-2 p-2 bg-gray-800/50 rounded-lg"
              onPress={() => openThread(item)}
            >
              <AvatarStack 
                sprintId={item.sprint_id} 
                joinCount={item.join_count} 
                fetchAvatars={fetchParticipantAvatars}
              />
              <Text className="text-blue-400 text-sm font-medium">
                {item.join_count - 1} {item.join_count - 1 === 1 ? 'reply' : 'replies'}
              </Text>
              <Feather name="chevron-right" size={16} color="#60A5FA" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
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
        .from('circle_members')
        .delete()
        .eq('circle_id', channelId)
        .eq('user_id', auth.user.id)

      if (error) {
        console.error('Error leaving circle:', error)
        Alert.alert('Error', 'Unable to leave circle. Please try again.')
        return
      }

      // Broadcast an event to notify other parts of the app that the user left a circle
      supabase.channel('circle-updates').send({
        type: 'broadcast',
        event: 'user-left-circle',
        payload: { userId: auth.user.id, circleId: channelId }
      })

      // After leaving, go back to inbox immediately
      router.back()
    } catch (err) {
      console.error('Error leaving circle:', err)
      Alert.alert('Error', 'Unable to leave circle. Please try again.')
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

  // Load friends who aren't already in the circle
  const loadAvailableFriends = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get current circle members
      const { data: members } = await supabase
        .from('circle_members')
        .select('user_id')
        .eq('circle_id', channelId)

      const memberIds = members?.map(m => m.user_id) || []

      // Get user's friends who aren't already in the circle
      const { data: friends } = await supabase
        .from('friends')
        .select(`
          friend_id,
          profiles!friends_friend_id_fkey (
            user_id,
            username
          )
        `)
        .eq('user_id', user.id)
        .not('friend_id', 'in', `(${memberIds.join(',')})`)

      const availableFriendsList = friends?.map((f: any) => ({
        user_id: f.profiles.user_id,
        username: f.profiles.username
      })) || []

      setAvailableFriends(availableFriendsList)
    } catch (error) {
      console.error('Error loading available friends:', error)
    }
  }

  // Add selected members to the circle
  const addMembersToCircle = async () => {
    if (selectedNewMembers.length === 0 || addingMembers) return

    try {
      setAddingMembers(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Add new members to circle_members table
      const newMembers = selectedNewMembers.map(userId => ({
        circle_id: channelId,
        user_id: userId,
        role: 'member'
      }))

      const { error: membersError } = await supabase
        .from('circle_members')
        .insert(newMembers)

      if (membersError) throw membersError

      // Get the usernames of added members for the system message
      const addedUsernames = availableFriends
        .filter(f => selectedNewMembers.includes(f.user_id))
        .map(f => f.username)

      // Send a system message about the addition
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          channel_id: channelId,
          circle_id: channelId,
          sender_id: user.id,
          content: `${addedUsernames.join(', ')} ${addedUsernames.length === 1 ? 'was' : 'were'} added to the circle`
        })

      if (messageError) console.error('Error sending system message:', messageError)

      // Reset state
      setSelectedNewMembers([])
      setShowAddMembers(false)
      
      // Reload chat info to update the title
      loadChatInfo()
    } catch (error) {
      console.error('Error adding members:', error)
      Alert.alert('Error', 'Failed to add members to the circle')
    } finally {
      setAddingMembers(false)
    }
  }

  const openReactionPicker = (msgId:number) => {
    setSelectedMessageId(msgId)
    setShowEmojiPicker(true)
  }

  const handlePickReaction = async (emoji: string) => {
    setShowEmojiPicker(false)
    if (!selectedMessageId) return
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) return
    // check existing reaction by this user
    const existing = reactionsMap[selectedMessageId]?.find(r => r.user_id === user.id)
    if (existing) {
      if (existing.emoji === emoji) {
        // unreact (toggle off)
        await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', selectedMessageId)
          .eq('user_id', user.id)
        setReactionsMap(prev => {
          const list = (prev[selectedMessageId] || []).filter(x => x.user_id !== user.id)
          const newMap = { ...prev, [selectedMessageId]: list }
          if (list.length === 0) delete newMap[selectedMessageId]
          return newMap
        })
      } else {
        // change emoji
        await supabase
          .from('message_reactions')
          .upsert({ message_id: selectedMessageId, user_id: user.id, emoji }, { onConflict: 'message_id,user_id' })
        setReactionsMap(prev => {
          const list = (prev[selectedMessageId] || []).filter(x => x.user_id !== user.id)
          list.push({ emoji, user_id: user.id })
          return { ...prev, [selectedMessageId]: list }
        })
      }
    } else {
      // first time reaction
      await supabase
        .from('message_reactions')
        .insert({ message_id: selectedMessageId, user_id: user.id, emoji })
      setReactionsMap(prev => {
        const list = [...(prev[selectedMessageId] || []), { emoji, user_id: user.id }]
        return { ...prev, [selectedMessageId]: list }
      })
    }
  }

  const ReactionPicker = () => (
    <EmojiPicker
      theme={emojiDarkTheme as any}
      onEmojiSelected={(emoji: { emoji: string }) => {
        handlePickReaction(emoji.emoji);
        setShowEmojiPicker(false);
      }}
      open={showEmojiPicker}
      enableSearchBar
      onClose={() => setShowEmojiPicker(false)}
    />
  )

  // -----------------------------------------------------------------
  // Join existing sprint directly from chat message
  // -----------------------------------------------------------------
  async function joinSprint (sprintId: string, circleId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user already joined
      const { data: existing } = await supabase
        .from('sprint_participants')
        .select('sprint_id')
        .eq('sprint_id', sprintId)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        Alert.alert('Already Joined', 'You have already joined this sprint.');
        return;
      }

      // Insert participant row (first time join)
      const { error: partErr } = await supabase
        .from('sprint_participants')
        .insert({ sprint_id: sprintId, user_id: user.id });

      if (partErr) {
        console.error('Error inserting sprint participant:', partErr);
        return;
      }

      // Get original sprint details to create joiner's sprint
      const { data: originalSprint } = await supabase
        .from('sprints')
        .select('topic, goals, quiz_question_count, ends_at, circle_id')
        .eq('id', sprintId)
        .single();

      // Get username for message
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .single();

      const username = profile?.username || 'Someone';

      if (originalSprint) {
        // Store data for after photo capture
        setJoinSprintData({
          sprintId,
          circleId,
          originalSprint,
          username
        });
        
        // Show camera for join photo
        setShowJoinCamera(true);
      }
    } catch (err) {
      console.error('Error joining sprint from chat:', err);
    }
  }

  // Add handler for join photo capture
  const handleJoinPhoto = async (photoUrl: string) => {
    if (!joinSprintData) return;
    
    setShowJoinCamera(false);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Upload photo first
      const uploadedPhotoUrl = await uploadJoinPhoto(photoUrl);
      
      // Create sprint for joiner with photo
      const { data: joinerSprint, error: sprintError } = await supabase
        .from('sprints')
        .insert({
          circle_id: joinSprintData.originalSprint.circle_id,
          user_id: user.id,
          topic: joinSprintData.originalSprint.topic,
          goals: joinSprintData.originalSprint.goals,
          quiz_question_count: joinSprintData.originalSprint.quiz_question_count,
          tags: [],
          ends_at: joinSprintData.originalSprint.ends_at,
          joined_from: joinSprintData.sprintId,
          media_url: uploadedPhotoUrl
        })
        .select()
        .single();

      if (sprintError) {
        console.error('[handleJoinPhoto] error creating joiner sprint:', sprintError);
        return;
      }

      // Send threaded join message with photo
      const { error: rpcError } = await supabase.rpc('upsert_sprint_message', {
        p_circle_id: joinSprintData.circleId,
        p_user_id: user.id,
        p_sprint_id: joinSprintData.sprintId,
        p_content: `🏃‍♂️ ${joinSprintData.username} joined the sprint`,
        p_media_url: uploadedPhotoUrl
      });

      if (rpcError) {
        console.error('[handleJoinPhoto] RPC error:', rpcError);
      } else {
        // Optimistically bump counter locally
        setMessages(curr => curr.map(m => m.sprint_id === joinSprintData.sprintId ? { ...m, join_count: (m.join_count || 1) + 1 } : m));
        setJoinedSprints(prev => [...prev, joinSprintData.sprintId]);
      }

      // Jump to sprints tab
      router.push({ pathname: '/(tabs)/sprints', params: { viewSprint: joinSprintData.sprintId } });
      
      // Clear join data
      setJoinSprintData(null);
    } catch (err) {
      console.error('Error handling join photo:', err);
    }
  };

  const uploadJoinPhoto = async (photoUri: string) => {
    try {
      const ext = 'jpg';
      const path = `joins/${Date.now()}.${ext}`;

      // Read file as base64 and convert to ArrayBuffer
      const base64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const arrayBuffer = decode(base64);

      const { error: uploadError } = await supabase
        .storage
        .from('chat-media')
        .upload(path, arrayBuffer, {
          contentType: 'image/jpeg'
        });

      if (uploadError) throw uploadError;

      const { data } = await supabase.storage.from('chat-media').getPublicUrl(path);
      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading join photo:', error);
      throw error;
    }
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('sprint_participants')
        .select('sprint_id')
        .eq('user_id', user.id);
      if (data) setJoinedSprints(data.map(r => r.sprint_id));
    })();
  }, []);

  // -----------------------------------------------------------------
  // Open thread view to see all join messages
  // -----------------------------------------------------------------
  const openThread = async (rootMessage: Message) => {
    if (!rootMessage.sprint_id) return;
    
    setLoadingThread(true);
    setThreadRootMessage(rootMessage);
    setShowThreadModal(true);
    
    try {
      // Load all messages in this thread (including the root)
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id, content, media_url, sprint_id, sender_id, created_at, join_count, thread_root_id,
          profiles!messages_sender_id_fkey(username)
        `)
        .or(`id.eq.${rootMessage.id},thread_root_id.eq.${rootMessage.id}`)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      
      const { data: { user } } = await supabase.auth.getUser();
      
      const processedMessages: Message[] = (data || []).map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        media_url: msg.media_url,
        sprint_id: msg.sprint_id,
        sender_id: msg.sender_id,
        created_at: msg.created_at,
        join_count: msg.join_count,
        sender_name: msg.profiles.username,
        is_own_message: msg.sender_id === user?.id,
      }));
      
      setThreadMessages(processedMessages);
    } catch (error) {
      console.error('Error loading thread:', error);
    } finally {
      setLoadingThread(false);
    }
  };

  // Add useEffect for thread subscription
  useEffect(() => {
    if (!showThreadModal || !threadRootMessage) return;
    
    const threadSubscription = supabase
      .channel(`thread:${threadRootMessage.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_root_id=eq.${threadRootMessage.id}`
        },
        async (payload) => {
          const newMessage = payload.new as any;
          
          // Get sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('user_id', newMessage.sender_id)
            .single();
            
          const { data: { user } } = await supabase.auth.getUser();
          
          const processedMessage: Message = {
            id: newMessage.id,
            content: newMessage.content,
            media_url: newMessage.media_url,
            sprint_id: newMessage.sprint_id,
            sender_id: newMessage.sender_id,
            created_at: newMessage.created_at,
            join_count: newMessage.join_count,
            sender_name: profile?.username || 'Unknown',
            is_own_message: newMessage.sender_id === user?.id,
          };
          
          setThreadMessages(prev => [...prev, processedMessage]);
        }
      )
      .subscribe();
      
    return () => {
      threadSubscription.unsubscribe();
    };
  }, [showThreadModal, threadRootMessage?.id]);

  // Add function to fetch participant avatars
  const fetchParticipantAvatars = async (sprintId: string) => {
    if (participantAvatars[sprintId]) return participantAvatars[sprintId];
    
    try {
      // First get participant user_ids
      const { data: participants, error: partError } = await supabase
        .from('sprint_participants')
        .select('user_id')
        .eq('sprint_id', sprintId)
        .limit(3); // Only fetch first 3 for display
        
      if (partError) {
        console.error('[fetchParticipantAvatars] participant error:', partError);
        return [];
      }
      
      if (!participants || participants.length === 0) {
        return [];
      }
      
      // Then get their profiles
      const userIds = participants.map(p => p.user_id);
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', userIds);
        
      if (profileError) {
        console.error('[fetchParticipantAvatars] profile error:', profileError);
        return [];
      }
       
      const avatars = (profiles || []).map((p: any) => {
        const avatar = p.avatar_url;
        return avatar;
      }).filter(Boolean);
      
      setParticipantAvatars(prev => ({
        ...prev,
        [sprintId]: avatars
      }));
      
      return avatars;
    } catch (error) {
      console.error('Error fetching participant avatars:', error);
      return [];
    }
  };

  const sendThreadMessage = async () => {
    if (!threadNewMessage.trim() || sendingThreadMessage || !threadRootMessage) return;
    
    const messageText = threadNewMessage.trim();
    setThreadNewMessage(''); // Clear input immediately
    
    try {
      setSendingThreadMessage(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { error } = await supabase
        .from('messages')
        .insert({
          circle_id: channelId,
          sender_id: user.id,
          content: messageText,
          thread_root_id: threadRootMessage.id
        });
        
      if (error) {
        setThreadNewMessage(messageText); // Restore on error
        throw error;
      }

      // Update root message join_count
      const { error: updateError } = await supabase
        .from('messages')
        .update({ 
          join_count: (threadRootMessage.join_count || 1) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', threadRootMessage.id);
        
      if (updateError) {
        console.error('Error updating thread count:', updateError);
      } else {
        // Update local thread root message
        setThreadRootMessage(prev => prev ? { ...prev, join_count: (prev.join_count || 1) + 1 } : null);
      }
    } catch (error) {
      console.error('Error sending thread message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSendingThreadMessage(false);
    }
  };

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
        {isCircle ? (
          // Circle chat: only settings icon
          <TouchableOpacity 
            onPress={() => router.push(`/(modals)/circle-settings?circleId=${channelId}`)}
            className="mr-3"
          >
            <Feather name="settings" size={22} color="white" />
          </TouchableOpacity>
        ) : (
          // Legacy channel chat: leave button
          <TouchableOpacity onPress={confirmLeaveChat}>
            <Feather name="trash-2" size={22} color="white" />
          </TouchableOpacity>
        )}
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

      {/* Add Members Modal */}
      {showAddMembers && (
        <View className="absolute inset-0 bg-black/50 justify-center items-center">
          <View className="bg-gray-900 rounded-lg w-4/5 max-h-96">
            <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
              <Text className="text-white text-lg font-semibold">Add Members</Text>
              <TouchableOpacity onPress={() => {
                setShowAddMembers(false)
                setSelectedNewMembers([])
              }}>
                <Feather name="x" size={24} color="white" />
              </TouchableOpacity>
            </View>
            
            <View className="max-h-64">
              <FlatList
                data={availableFriends}
                keyExtractor={(item) => item.user_id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedNewMembers(prev =>
                        prev.includes(item.user_id)
                          ? prev.filter(id => id !== item.user_id)
                          : [...prev, item.user_id]
                      )
                    }}
                    className="flex-row items-center p-4 border-b border-gray-800"
                  >
                    <View className="w-10 h-10 rounded-full bg-gray-600 items-center justify-center mr-3">
                      <Feather name="user" size={18} color="white" />
                    </View>
                    <Text className="text-white flex-1">{item.username}</Text>
                    <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                      selectedNewMembers.includes(item.user_id) ? 'bg-blue-500 border-blue-500' : 'border-gray-400'
                    }`}>
                      {selectedNewMembers.includes(item.user_id) && (
                        <Feather name="check" size={12} color="white" />
                      )}
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={() => (
                  <View className="p-8 items-center">
                    <Feather name="users" size={48} color="gray" />
                    <Text className="text-gray-400 text-center mt-4">
                      No friends available to add
                    </Text>
                    <Text className="text-gray-500 text-sm text-center mt-2">
                      All your friends are already in this circle
                    </Text>
                  </View>
                )}
              />
            </View>

            <View className="p-4 border-t border-gray-700">
              <TouchableOpacity
                onPress={addMembersToCircle}
                disabled={selectedNewMembers.length === 0 || addingMembers}
                className={`py-3 rounded-lg items-center ${
                  selectedNewMembers.length > 0 && !addingMembers ? 'bg-blue-500' : 'bg-gray-600'
                }`}
              >
                <Text className="text-white font-semibold">
                  {addingMembers ? 'Adding...' : `Add ${selectedNewMembers.length} Member${selectedNewMembers.length !== 1 ? 's' : ''}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <ReactionPicker />

      {/* Thread Modal */}
      <Modal
        visible={showThreadModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView className="flex-1 bg-black">
          {/* Thread Header */}
          <View className="flex-row items-center justify-between p-4 border-b border-gray-800">
            <TouchableOpacity onPress={() => {
              setShowThreadModal(false);
              setThreadMessages([]);
              setThreadRootMessage(null);
              setThreadNewMessage('');
            }}>
              <Feather name="x" size={24} color="white" />
            </TouchableOpacity>
            <Text className="text-white text-lg font-semibold">Thread</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Thread Messages */}
          {loadingThread ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color="white" />
            </View>
          ) : (
            <FlatList
              data={threadMessages}
              renderItem={({ item }) => (
                <View className={`mb-3 mx-4 ${item.is_own_message ? 'items-end' : 'items-start'}`}>
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
                    {item.media_url ? (
                      <Image
                        source={{ uri: item.media_url }}
                        style={{ width: 200, height: 200, borderRadius: 8 }}
                      />
                    ) : (
                      <Text className="text-white text-base">
                        {item.content}
                      </Text>
                    )}
                    <Text className={`text-xs mt-1 ${
                      item.is_own_message ? 'text-blue-100' : 'text-gray-400'
                    }`}>
                      {formatTime(item.created_at)}
                    </Text>
                  </View>
                </View>
              )}
              keyExtractor={(item) => item.id.toString()}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 16 }}
            />
          )}

          {/* Thread Message Input */}
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={keyboardOffset}
            className="border-t border-gray-800"
          >
            <View className="flex-row items-center p-4 space-x-3">
              <View className="flex-1">
                <TextInput
                  value={threadNewMessage}
                  onChangeText={setThreadNewMessage}
                  placeholder="Reply to thread..."
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-800 text-white rounded-full px-4 py-3 max-h-20"
                  multiline
                  onSubmitEditing={sendThreadMessage}
                  blurOnSubmit={false}
                />
              </View>
              
              <TouchableOpacity 
                onPress={sendThreadMessage}
                disabled={!threadNewMessage.trim() || sendingThreadMessage}
                className={`w-10 h-10 rounded-full items-center justify-center ${
                  threadNewMessage.trim() && !sendingThreadMessage ? 'bg-blue-500' : 'bg-gray-600'
                }`}
              >
                <Feather 
                  name="send" 
                  size={18} 
                  color="white" 
                />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Join Sprint Camera */}
      {showJoinCamera && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
          <SprintCamera
            onCapture={handleJoinPhoto}
            onCancel={() => {
              setShowJoinCamera(false);
              setJoinSprintData(null);
            }}
          />
        </View>
      )}
    </SafeAreaView>
  )
} 