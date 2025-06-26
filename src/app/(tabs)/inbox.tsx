import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native'
import React, { useState, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../../lib/supabase'

interface CirclePreview {
  id: string
  name: string
  visibility: string
  sprint_minutes: number
  ttl_minutes: number
  role: string
  member_count: number
  last_message_at: string | null
}

export default function InboxScreen() {
  const [circles, setCircles] = useState<CirclePreview[]>([])
  const [loading, setLoading] = useState(true)

  // Refresh chats when the screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadCircles()
    }, [])
  )

  useEffect(() => {
    let channel: any // RealtimeChannel – keep as any to avoid importing extra type
    let refreshInterval: ReturnType<typeof setInterval>

    const initRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Make sure we start with fresh data
      loadCircles()

      // Set up periodic refresh every 30 seconds as a fallback
      refreshInterval = setInterval(() => {
        loadCircles()
      }, 30000)

      channel = supabase
        .channel(`inbox:${user.id}`)
        // Listen for broadcast events when users leave chats
        .on('broadcast', { event: 'user-left-chat' }, (payload) => {
          loadCircles()
        })
        // Someone just added *this* user to a channel (a new chat was created)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'circle_members',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadCircles()
          }
        )
        // Someone removed *this* user from a channel (they left or were removed)
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'circle_members',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadCircles()
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
          () => loadCircles()
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
            loadCircles()
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

  const loadCircles = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_user_circles')

      if (error) {
        console.error('Error loading circles via rpc:', error)
        throw error
      }
      
      setCircles(data as any[] || [])
    } catch (error) {
      console.error('Error loading circles:', error)
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

  const getCircleDisplayName = (circle: CirclePreview) => circle.name

  // For now we don't have per-member avatars for circles; return null to show default icon
  const getCircleAvatar = (_circle: CirclePreview) => null

  const showCircleOptions = (circle: CirclePreview) => {
    Alert.alert(
      circle.name,
      'Choose an action',
      [
        {
          text: 'Open Chat',
          onPress: () => router.push(`/(modals)/chat?circleId=${circle.id}`)
        },
        {
          text: 'Circle Settings',
          onPress: () => router.push(`/(modals)/circle-settings?circleId=${circle.id}`)
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  };

  const renderCircleItem = ({ item }: { item: CirclePreview }) => (
    <TouchableOpacity
      onPress={() => router.push(`/(modals)/chat?circleId=${item.id}`)}
      onLongPress={() => showCircleOptions(item)}
      className="flex-row items-center p-4 border-b border-gray-800"
    >
      <View className="w-12 h-12 rounded-full bg-gray-600 items-center justify-center mr-3">
        <Feather name="users" size={20} color="white" />
      </View>
      
      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-1">
          <View className="flex-1 flex-row items-center">
            <Text className="text-white font-semibold text-base flex-1">
              {getCircleDisplayName(item)}
            </Text>
            {item.visibility === 'public' && (
              <Feather name="globe" size={14} color="#9CA3AF" style={{ marginLeft: 8 }} />
            )}
          </View>
          {item.last_message_at ? (
            <Text className="text-gray-400 text-sm" numberOfLines={1}>
              Last activity {formatTime(item.last_message_at)} ago
            </Text>
          ) : (
            <Text className="text-gray-500 text-sm italic">
              No activity yet
            </Text>
          )}
        </View>
        
        {/* Show member count and role */}
        <View className="flex-row items-center">
          <Text className="text-gray-500 text-sm italic">
            {item.member_count} member{item.member_count !== 1 ? 's' : ''}
          </Text>
          {item.role === 'owner' && (
            <View className="flex-row items-center ml-2">
              <Feather name="star" size={12} color="#F59E0B" />
              <Text className="text-yellow-500 text-xs ml-1">Owner</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-black">
        <View className="flex-1 justify-center items-center">
          <Text className="text-white">Loading circles...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1">
        {/* Header */}
        <View className="flex-row justify-between items-center p-4 border-b border-gray-800">
          <Text className="text-white text-xl font-bold">Circles</Text>
          <View className="flex-row items-center space-x-3">
            <TouchableOpacity onPress={() => router.push('/(modals)/discover-circles')}>
              <Feather name="search" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(modals)/new-chat')}>
              <Feather name="edit" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Circle List */}
        {circles.length > 0 ? (
          <FlatList
            data={circles}
            renderItem={renderCircleItem}
            keyExtractor={(item) => item.id}
            className="flex-1"
          />
        ) : (
          <View className="flex-1 justify-center items-center p-8">
            <Feather name="message-circle" size={64} color="gray" />
            <Text className="text-gray-400 text-lg mt-4 text-center">
              No circles yet
            </Text>
            <Text className="text-gray-500 text-sm mt-2 text-center">
              Start a conversation with your friends or discover public circles
            </Text>
            <View className="flex-row space-x-3 mt-6">
              <TouchableOpacity 
                onPress={() => router.push('/(modals)/new-chat')}
                className="bg-blue-500 px-6 py-3 rounded-full"
              >
                <Text className="text-white font-semibold">Start Circle</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => router.push('/(modals)/discover-circles')}
                className="bg-green-500 px-6 py-3 rounded-full"
              >
                <Text className="text-white font-semibold">Discover</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}
