import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native'
import React, { useState, useEffect, useRef } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../../lib/supabase'

interface Message {
  id: number
  content: string
  sender_id: string
  created_at: string
  sender_name: string
  is_own_message: boolean
}

export default function ChatScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [chatTitle, setChatTitle] = useState('Chat')
  const flatListRef = useRef<FlatList>(null)

  useEffect(() => {
    if (channelId) {
      loadMessages()
      loadChatInfo()
      subscribeToMessages()
    }
  }, [channelId])

  const loadChatInfo = async () => {
    try {
      const { data: channel, error } = await supabase
        .from('channels')
        .select(`
          is_group,
          channel_members (
            profiles (
              username
            )
          )
        `)
        .eq('id', channelId)
        .single()

      if (error) throw error

      if (channel) {
        if (channel.is_group) {
                     setChatTitle((channel.channel_members as any[]).map((m: any) => m.profiles.username).join(', '))
                  } else {
            setChatTitle((channel.channel_members as any[])[0]?.profiles?.username || 'Chat')
          }
      }
    } catch (error) {
      console.error('Error loading chat info:', error)
    }
  }

  const loadMessages = async () => {
    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) return

      const { data: messages, error } = await supabase
        .from('messages')
        .select(`
          id,
          content,
          sender_id,
          created_at,
          profiles!inner (
            username
          )
        `)
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })

      if (error) throw error

      const transformedMessages: Message[] = messages?.map(msg => ({
        id: msg.id,
        content: msg.content,
        sender_id: msg.sender_id,
        created_at: msg.created_at,
                 sender_name: (msg.profiles as any).username,
        is_own_message: msg.sender_id === user.user.id
      })) || []

      setMessages(transformedMessages)
    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const subscribeToMessages = () => {
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
        (payload) => {
          // Reload messages when new message arrives
          loadMessages()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
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
        <Text className="text-white text-base">
          {item.content}
        </Text>
        <Text className={`text-xs mt-1 ${
          item.is_own_message ? 'text-blue-100' : 'text-gray-400'
        }`}>
          {formatTime(item.created_at)}
        </Text>
      </View>
    </View>
  )

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
          <TouchableOpacity>
            <Feather name="more-vertical" size={24} color="white" />
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