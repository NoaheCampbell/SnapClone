import { View, Text, FlatList, TouchableOpacity, TextInput } from 'react-native'
import React, { useState, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '../../../lib/supabase'

interface Friend {
  user_id: string
  username: string
  avatar_url?: string
}

export default function NewChatScreen() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadFriends()
  }, [])

  const loadFriends = async () => {
    try {
      // Get current user so we only fetch their friends and avoid showing themselves
      const { data: currentUser } = await supabase.auth.getUser()
      if (!currentUser.user) return

      const { data, error } = await supabase
        .from('friends')
        .select(
          `
          friend_id,
          profiles!friends_friend_id_fkey (
            user_id,
            username,
            avatar_url
          )
        `
        )
        .eq('user_id', currentUser.user.id) // only rows where the logged-in user is the owner

      if (error) throw error

      const friendsList: Friend[] =
        data?.
          filter((f: any) => f.friend_id !== currentUser.user.id) // safety: don't include self
          .map((f: any) => ({
            user_id: f.profiles.user_id,
            username: f.profiles.username,
            avatar_url: f.profiles.avatar_url
          })) || []

      setFriends(friendsList)
    } catch (error) {
      console.error('Error loading friends:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredFriends = friends.filter(friend =>
    friend.username.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    )
  }

  const createChat = async () => {
    if (selectedFriends.length === 0 || creating) return

    try {
      setCreating(true)
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return

      const myId = auth.user.id

      // -----------------------------------------------------------
      // 1. Check for an existing circle with *exactly* this member set
      // -----------------------------------------------------------
      const desiredMemberIds = [myId, ...selectedFriends].sort()

      const { data: existingCircles, error: existingErr } = await supabase
        .rpc('get_user_circles')

      if (existingErr) throw existingErr

      if (existingCircles && existingCircles.length > 0) {
        // For now, just create a new circle - we can add duplicate detection later
        // TODO: Check if circle with same members already exists
      }

      // -----------------------------------------------------------
      // 2. Create a new circle directly in the database
      // -----------------------------------------------------------
      const friendsUsernames = friends
        .filter(f => selectedFriends.includes(f.user_id))
        .map(f => f.username)
        .join(', ')
      
      const circleName = friendsUsernames || 'New Circle'

      // Create the circle
      const { data: circleData, error: circleError } = await supabase
        .from('circles')
        .insert({
          name: circleName,
          owner: myId,
          visibility: 'private',
          sprint_minutes: 25,
          ttl_minutes: 30
        })
        .select()
        .single()

      if (circleError) throw circleError

      // -----------------------------------------------------------
      // 3. Add all members to the circle (including creator as owner)
      // -----------------------------------------------------------
      const allMembers = [
        { circle_id: circleData.id, user_id: myId, role: 'owner' },
        ...selectedFriends.map(friendId => ({ 
          circle_id: circleData.id, 
          user_id: friendId,
          role: 'member'
        }))
      ]

      const { error: membersError } = await supabase
        .from('circle_members')
        .insert(allMembers)

      if (membersError) throw membersError

      router.replace(`/(modals)/chat?circleId=${circleData.id}`)
    } catch (error) {
      console.error('Error creating circle:', error)
    } finally {
      setCreating(false)
    }
  }

  const renderFriend = ({ item }: { item: Friend }) => {
    const isSelected = selectedFriends.includes(item.user_id)
    
    return (
      <TouchableOpacity
        onPress={() => toggleFriendSelection(item.user_id)}
        className="flex-row items-center p-4 border-b border-gray-800"
      >
        <View className="w-12 h-12 rounded-full bg-gray-600 items-center justify-center mr-3">
          <Feather name="user" size={20} color="white" />
        </View>
        
        <View className="flex-1">
          <Text className="text-white font-semibold text-base">
            {item.username}
          </Text>
        </View>
        
        <View className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
          isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-400'
        }`}>
          {isSelected && (
            <Feather name="check" size={14} color="white" />
          )}
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-black">
        <View className="flex-1 justify-center items-center">
          <Text className="text-white">Loading friends...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1">
        {/* Header */}
        <View className="flex-row items-center p-4 border-b border-gray-800">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Feather name="x" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-lg font-semibold flex-1">
            New Chat
          </Text>
          <TouchableOpacity
            onPress={createChat}
            disabled={selectedFriends.length === 0 || creating}
            className={`px-4 py-2 rounded-full ${
              selectedFriends.length > 0 && !creating ? 'bg-blue-500' : 'bg-gray-600'
            }`}
          >
            <Text className="text-white font-semibold">
              {creating ? 'Creating...' : 'Create'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View className="p-4">
          <View className="flex-row items-center bg-gray-800 rounded-full px-4 py-2">
            <Feather name="search" size={20} color="gray" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search friends..."
              placeholderTextColor="gray"
              className="flex-1 text-white text-base ml-3"
            />
          </View>
        </View>

        {/* Selected Friends Count */}
        {selectedFriends.length > 0 && (
          <View className="px-4 pb-2">
            <Text className="text-blue-400 text-sm">
              {selectedFriends.length} friend{selectedFriends.length > 1 ? 's' : ''} selected
            </Text>
          </View>
        )}

        {/* Friends List */}
        {filteredFriends.length > 0 ? (
          <FlatList
            data={filteredFriends}
            renderItem={renderFriend}
            keyExtractor={(item) => item.user_id}
            className="flex-1"
          />
        ) : (
          <View className="flex-1 justify-center items-center p-8">
            <Feather name="users" size={64} color="gray" />
            <Text className="text-gray-400 text-lg mt-4 text-center">
              {searchQuery ? 'No friends found' : 'No friends yet'}
            </Text>
            <Text className="text-gray-500 text-sm mt-2 text-center">
              {searchQuery ? 'Try a different search' : 'Add some friends to start chatting'}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
} 