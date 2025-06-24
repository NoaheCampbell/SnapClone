import { View, Text, FlatList, TouchableOpacity, Image } from 'react-native'
import React, { useState, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../../lib/supabase'

interface Chat {
  id: string
  is_group: boolean
  last_message?: {
    content: string
    created_at: string
    sender_name: string
  }
  participants: {
    user_id: string
    username: string
    avatar_url?: string
  }[]
}

export default function InboxScreen() {
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)

  // Refresh chats when the screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadChats()
    }, [])
  )

  useEffect(() => {
    let channel: any // RealtimeChannel – keep as any to avoid importing extra type
    let refreshInterval: ReturnType<typeof setInterval>

    const initRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Make sure we start with fresh data
      loadChats()

      // Set up periodic refresh every 30 seconds as a fallback
      refreshInterval = setInterval(() => {
        loadChats()
      }, 30000)

      channel = supabase
        .channel(`inbox:${user.id}`)
        // Listen for broadcast events when users leave chats
        .on('broadcast', { event: 'user-left-chat' }, (payload) => {
          console.log('Received user-left-chat broadcast, refreshing chats')
          loadChats()
        })
        // Someone just added *this* user to a channel (a new chat was created)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'channel_members',
            filter: `member_id=eq.${user.id}`,
          },
          () => {
            console.log('User added to channel, refreshing chats')
            loadChats()
          }
        )
        // Someone removed *this* user from a channel (they left or were removed)
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'channel_members',
            filter: `member_id=eq.${user.id}`,
          },
          () => {
            console.log('User removed from channel, refreshing chats')
            loadChats()
          }
        )
        // A brand-new message landed anywhere – cheaper to just refresh the list
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          () => loadChats()
        )
        // A message was deleted (e.g., by cron job) – refresh to update last message
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'messages',
          },
          () => {
            console.log('Message deleted, refreshing chats')
            loadChats()
          }
        )
        .subscribe()
    }

    initRealtime()

    return () => {
      if (channel) supabase.removeChannel(channel)
      if (refreshInterval) clearInterval(refreshInterval)
    }
  }, [])

  const loadChats = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_user_chats')

      if (error) {
        console.error('Error loading chats via rpc:', error)
        throw error
      }
      
      setChats(data as any[] || [])
    } catch (error) {
      console.error('Error loading chats:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = diff / (1000 * 60 * 60)
    
    if (hours < 1) {
      return `${Math.floor(diff / (1000 * 60))}m`
    } else if (hours < 24) {
      return `${Math.floor(hours)}h`
    } else {
      return `${Math.floor(hours / 24)}d`
    }
  }

  const getChatDisplayName = (chat: Chat) => {
    if (!chat.participants) {
      return chat.is_group ? 'Group' : 'Chat'
    }
    if (chat.is_group) {
      return chat.participants.map(p => p.username).join(', ')
    }
    return chat.participants[0]?.username || 'Unknown'
  }

  const getChatAvatar = (chat: Chat) => {
    if (chat.is_group || !chat.participants || chat.participants.length === 0) {
      return null // Could show group icon
    }
    return chat.participants[0]?.avatar_url
  }

  const renderChatItem = ({ item }: { item: Chat }) => (
    <TouchableOpacity
      onPress={() => router.push(`/(modals)/chat?channelId=${item.id}`)}
      className="flex-row items-center p-4 border-b border-gray-800"
    >
      <View className="w-12 h-12 rounded-full bg-gray-600 items-center justify-center mr-3">
        {getChatAvatar(item) ? (
          <Image 
            source={{ uri: getChatAvatar(item)! }} 
            className="w-12 h-12 rounded-full"
          />
        ) : (
          <Feather 
            name={item.is_group ? "users" : "user"} 
            size={20} 
            color="white" 
          />
        )}
      </View>
      
      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-white font-semibold text-base">
            {getChatDisplayName(item)}
          </Text>
          {item.last_message && (
            <Text className="text-gray-400 text-sm">
              {formatTime(item.last_message.created_at)}
            </Text>
          )}
        </View>
        
        {item.last_message ? (
          <Text className="text-gray-400 text-sm" numberOfLines={1}>
            {item.is_group && `${item.last_message.sender_name}: `}
            {item.last_message.content}
          </Text>
        ) : (
          <Text className="text-gray-500 text-sm italic">
            No messages yet
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-black">
        <View className="flex-1 justify-center items-center">
          <Text className="text-white">Loading chats...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1">
        {/* Header */}
        <View className="flex-row justify-between items-center p-4 border-b border-gray-800">
          <Text className="text-white text-xl font-bold">Chats</Text>
          <TouchableOpacity onPress={() => router.push('/(modals)/new-chat')}>
            <Feather name="edit" size={24} color="white" />
          </TouchableOpacity>
        </View>

        {/* Chat List */}
        {chats.length > 0 ? (
          <FlatList
            data={chats}
            renderItem={renderChatItem}
            keyExtractor={(item) => item.id}
            className="flex-1"
          />
        ) : (
          <View className="flex-1 justify-center items-center p-8">
            <Feather name="message-circle" size={64} color="gray" />
            <Text className="text-gray-400 text-lg mt-4 text-center">
              No chats yet
            </Text>
            <Text className="text-gray-500 text-sm mt-2 text-center">
              Start a conversation with your friends
            </Text>
            <TouchableOpacity 
              onPress={() => router.push('/(modals)/new-chat')}
              className="bg-blue-500 px-6 py-3 rounded-full mt-6"
            >
              <Text className="text-white font-semibold">Start Chat</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}
