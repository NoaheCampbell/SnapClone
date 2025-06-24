import { View, Text, FlatList, TouchableOpacity, Image } from 'react-native'
import React, { useState, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '../../../lib/supabase'

interface Chat {
  id: string
  isGroup: boolean
  lastMessage?: {
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

  useEffect(() => {
    loadChats()
  }, [])

  const loadChats = async () => {
    try {
      // Get user's channels with last messages and participants
      const { data: channels, error } = await supabase
        .from('channels')
        .select(`
          id,
          is_group,
          channel_members!inner (
            profiles!inner (
              user_id,
              username,
              avatar_url
            )
          ),
          messages (
            content,
            created_at,
            profiles!inner (
              username
            )
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Transform data for easier use
      const transformedChats: Chat[] = channels?.map(channel => ({
        id: channel.id,
        isGroup: channel.is_group,
        participants: channel.channel_members.map((member: any) => member.profiles),
        lastMessage: channel.messages?.[0] ? {
          content: channel.messages[0].content,
          created_at: channel.messages[0].created_at,
          sender_name: (channel.messages[0].profiles as any).username
        } : undefined
      })) || []

      setChats(transformedChats)
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
    if (chat.isGroup) {
      return chat.participants.map(p => p.username).join(', ')
    }
    // For 1-on-1 chats, show the other person's name
    return chat.participants[0]?.username || 'Unknown'
  }

  const getChatAvatar = (chat: Chat) => {
    if (chat.isGroup) {
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
            name={item.isGroup ? "users" : "user"} 
            size={20} 
            color="white" 
          />
        )}
      </View>
      
      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-white font-semibold text-16">
            {getChatDisplayName(item)}
          </Text>
          {item.lastMessage && (
            <Text className="text-gray-400 text-sm">
              {formatTime(item.lastMessage.created_at)}
            </Text>
          )}
        </View>
        
        {item.lastMessage ? (
          <Text className="text-gray-400 text-sm" numberOfLines={1}>
            {item.isGroup && `${item.lastMessage.sender_name}: `}
            {item.lastMessage.content}
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
