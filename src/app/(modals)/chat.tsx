import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Image } from 'react-native'
import React, { useState, useEffect, useRef } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import * as ImagePicker from 'expo-image-picker'
import { Video, ResizeMode } from 'expo-av'
import { decode } from 'base64-arraybuffer'
import * as FileSystem from 'expo-file-system'

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
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [chatTitle, setChatTitle] = useState('Chat')
  const flatListRef = useRef<FlatList>(null)

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

            setMessages(currentMessages => [
              ...currentMessages,
              {
                id: newMessage.id,
                content: newMessage.content,
                sender_id: newMessage.sender_id,
                created_at: newMessage.created_at,
                sender_name: profile?.username || 'Unknown',
                is_own_message: newMessage.sender_id === user?.id,
                media_url: newMessage.media_url,
              }
            ])
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

      if (error) throw error

      const { is_group, participants } = data
      if (is_group) {
        setChatTitle(participants?.map((p: any) => p.username).join(', ') || 'Group')
      } else {
        setChatTitle(participants?.[0]?.username || 'Chat')
      }
    } catch (error) {
      console.error('Error loading chat info:', error)
    }
  }

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase.rpc('get_chat_messages', { p_channel_id: channelId })
      
      if (error) throw error

      setMessages(data || [])
    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const subscribeToMessages = () => {
    // This is now handled in the useEffect hook directly
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return

    try {
      setSending(true)
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) return

      const { error } = await supabase
        .from('messages')
        .insert({
          channel_id: channelId,
          sender_id: user.user.id,
          content: newMessage.trim()
        })

      if (error) throw error

      setNewMessage('')
      // Messages will be updated via subscription
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setSending(false)
    }
  }

  const pickAndSendMedia = async () => {
    try {
      // Ask for permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Need camera roll permission to send media')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.7
      })

      if (result.canceled) return

      setUploading(true)

      const asset = result.assets[0]
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg'
      const fileType = asset.type ?? 'image'

      const path = `${channelId}/${Date.now()}.${ext}`

      // Read file as base64 and convert to ArrayBuffer (React Native method)
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      
      const arrayBuffer = decode(base64)

      const { error: uploadError } = await supabase
        .storage
        .from('chat-media')
        .upload(path, arrayBuffer, {
          contentType: fileType.startsWith('video') ? 'video/mp4' : `image/${ext}`
        })

      if (uploadError) throw uploadError

      const { data } = await supabase.storage.from('chat-media').getPublicUrl(path)

      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error('Not authenticated')

      const { error: insertError } = await supabase
        .from('messages')
        .insert({
          channel_id: channelId,
          sender_id: user.user.id,
          media_url: data.publicUrl,
        })

      if (insertError) throw insertError
    } catch (err) {
      console.error('Error sending media:', err)
      Alert.alert('Upload failed', 'Could not send media')
    } finally {
      setUploading(false)
    }
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
        <Text className={`text-xs mt-1 ${
          item.is_own_message ? 'text-blue-100' : 'text-gray-400'
        }`}>
          {formatTime(item.created_at)}
        </Text>
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

      await supabase
        .from('channel_members')
        .delete()
        .eq('channel_id', channelId)
        .eq('member_id', auth.user.id)

      // After leaving, go back to inbox
      router.back()
    } catch (err) {
      console.error('Error leaving chat:', err)
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
      <KeyboardAvoidingView 
        className="flex-1" 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id.toString()}
          className="flex-1 px-4"
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Message Input */}
        <View className="flex-row items-center p-4 border-t border-gray-800">
          {/* Media picker */}
          <TouchableOpacity onPress={pickAndSendMedia} className="mr-3">
            <Feather name="plus" size={22} color="white" />
          </TouchableOpacity>

          <View className="flex-1 flex-row items-center bg-gray-800 rounded-full px-4 py-2 mr-3">
            <TextInput
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Type a message..."
              placeholderTextColor="gray"
              className="flex-1 text-white text-base"
              multiline
              maxLength={500}
            />
          </View>
          <TouchableOpacity
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
            className={`w-10 h-10 rounded-full items-center justify-center ${
              newMessage.trim() && !sending ? 'bg-blue-500' : 'bg-gray-600'
            }`}
          >
            <Feather 
              name={sending ? "clock" : "send"} 
              size={20} 
              color="white" 
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
} 