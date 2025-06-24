import { View, Text, FlatList, TouchableOpacity, Alert, Image, Modal, TextInput } from 'react-native'
import React, { useState, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../../lib/supabase'

interface Profile {
  user_id: string
  username: string
  display_name?: string
  avatar_url?: string
  created_at: string
}

interface Friend {
  user_id: string
  friend_id: string
  created_at: string
  friend_profile: Profile
}

interface FriendRequest {
  id: number
  from_id: string
  to_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  from_profile: Profile
}

export default function FriendsScreen() {
  const { user } = useAuth()
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  useEffect(() => {
    if (user) {
      loadFriends()
      loadFriendRequests()
    }
  }, [user])

  const loadFriends = async () => {
    if (!user) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('friends')
        .select(`
          *,
          friend_profile:profiles!friends_friend_id_fkey(*)
        `)
        .eq('user_id', user.id)

      if (error) {
        console.error('Error loading friends:', error)
      } else {
        setFriends(data || [])
      }
    } catch (error) {
      console.error('Error loading friends:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadFriendRequests = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select(`
          *,
          from_profile:profiles!friend_requests_from_id_fkey(*)
        `)
        .eq('to_id', user.id)
        .eq('status', 'pending')

      if (error) {
        console.error('Error loading friend requests:', error)
      } else {
        setFriendRequests(data || [])
      }
    } catch (error) {
      console.error('Error loading friend requests:', error)
    }
  }

  const searchUsers = async (query: string) => {
    if (!query.trim() || !user) {
      setSearchResults([])
      return
    }

    setSearchLoading(true)
    
    try {
      const { data: allProfiles, error } = await supabase
        .from('profiles')
        .select('*')

      if (error) {
        console.error('Error fetching profiles:', error)
        setSearchResults([])
        return
      }

      if (allProfiles) {
        const searchTerm = query.trim().toLowerCase()
        const filtered = allProfiles
          .filter(profile => profile.user_id !== user.id)
          .filter(profile => {
            const usernameMatch = profile.username?.toLowerCase().includes(searchTerm)
            const displayNameMatch = profile.display_name?.toLowerCase().includes(searchTerm)
            return usernameMatch || displayNameMatch
          })
        
        setSearchResults(filtered)
      } else {
        setSearchResults([])
      }
    } catch (error) {
      console.error('Error searching users:', error)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  const sendFriendRequest = async (toUserId: string) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to send friend requests.')
      return
    }

    try {
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          from_id: user.id,
          to_id: toUserId,
          status: 'pending'
        })

      if (error) {
        console.error('Error sending friend request:', error)
        if (error.message.includes('duplicate key value')) {
          Alert.alert('Request Already Sent', 'You have already sent a friend request to this user.')
        } else {
          Alert.alert('Error', `Failed to send friend request: ${error.message}`)
        }
      } else {
        Alert.alert('Success', 'Friend request sent!')
        setSearchResults(prev => prev.filter(p => p.user_id !== toUserId))
      }
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error('An unexpected error occurred.')
      console.error('Caught exception in sendFriendRequest:', err)
      Alert.alert('Error', err.message)
    }
  }

  const respondToFriendRequest = async (requestId: number, status: 'accepted' | 'rejected') => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('friend_requests')
        .update({ status })
        .eq('id', requestId)

      if (error) {
        Alert.alert('Error', 'Failed to respond to friend request')
        return
      }

      if (status === 'accepted') {
        const request = friendRequests.find(r => r.id === requestId)
        if (request) {
          const { error: friendError } = await supabase
            .from('friends')
            .insert([
              { user_id: user.id, friend_id: request.from_id },
              { user_id: request.from_id, friend_id: user.id }
            ])

          if (friendError) {
            console.error('Error adding friend:', friendError)
          } else {
            loadFriends()
          }
        }
      }

      loadFriendRequests()
    } catch (error) {
      Alert.alert('Error', 'Failed to respond to friend request')
    }
  }

  const removeFriend = async (friendId: string) => {
    if (!user) return

    Alert.alert(
      'Remove Friend',
      'Are you sure you want to remove this friend?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('friends')
                .delete()
                .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)

              if (error) {
                Alert.alert('Error', 'Failed to remove friend')
              } else {
                loadFriends()
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to remove friend')
            }
          }
        }
      ]
    )
  }

  const renderFriend = ({ item }: { item: Friend }) => (
    <View className="mx-6 mb-4 bg-gray-800/50 rounded-2xl p-4 flex-row items-center">
      <View className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full items-center justify-center mr-4">
        {item.friend_profile.avatar_url ? (
          <Image 
            source={{ uri: item.friend_profile.avatar_url }} 
            className="w-16 h-16 rounded-full"
          />
        ) : (
          <Text className="text-white text-xl font-bold">
            {item.friend_profile.display_name?.charAt(0) || item.friend_profile.username.charAt(0)}
          </Text>
        )}
      </View>
      
      <View className="flex-1">
        <Text className="text-white text-lg font-bold">
          {item.friend_profile.display_name || item.friend_profile.username}
        </Text>
        <Text className="text-gray-400 text-sm">@{item.friend_profile.username}</Text>
      </View>
      
      <TouchableOpacity
        onPress={() => removeFriend(item.friend_id)}
        className="w-10 h-10 bg-red-500/20 rounded-full items-center justify-center"
      >
        <Feather name="user-minus" size={16} color="#ef4444" />
      </TouchableOpacity>
    </View>
  )

  const renderSearchResult = ({ item }: { item: Profile }) => (
    <View className="mx-6 mb-4 bg-gray-800/50 rounded-2xl p-4 flex-row items-center">
      <View className="w-16 h-16 bg-gradient-to-br from-green-500 to-blue-600 rounded-full items-center justify-center mr-4">
        {item.avatar_url ? (
          <Image 
            source={{ uri: item.avatar_url }} 
            className="w-16 h-16 rounded-full"
          />
        ) : (
          <Text className="text-white text-xl font-bold">
            {item.display_name?.charAt(0) || item.username.charAt(0)}
          </Text>
        )}
      </View>
      
      <View className="flex-1">
        <Text className="text-white text-lg font-bold">
          {item.display_name || item.username}
        </Text>
        <Text className="text-gray-400 text-sm">@{item.username}</Text>
      </View>
      
      <TouchableOpacity
        onPress={() => sendFriendRequest(item.user_id)}
        className="bg-blue-500 px-4 py-2 rounded-full"
      >
        <Text className="text-white font-bold">Add</Text>
      </TouchableOpacity>
    </View>
  )

  const renderFriendRequest = ({ item }: { item: FriendRequest }) => (
    <View className="mx-6 mb-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
      <View className="flex-row items-center mb-3">
        <View className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-full items-center justify-center mr-4">
          {item.from_profile.avatar_url ? (
            <Image 
              source={{ uri: item.from_profile.avatar_url }} 
              className="w-16 h-16 rounded-full"
            />
          ) : (
            <Text className="text-white text-xl font-bold">
              {item.from_profile.display_name?.charAt(0) || item.from_profile.username.charAt(0)}
            </Text>
          )}
        </View>
        
        <View className="flex-1">
          <Text className="text-white text-lg font-bold">
            {item.from_profile.display_name || item.from_profile.username}
          </Text>
          <Text className="text-gray-400 text-sm">@{item.from_profile.username}</Text>
          <Text className="text-yellow-400 text-xs">wants to be your friend</Text>
        </View>
      </View>
      
      <View className="flex-row space-x-3">
        <TouchableOpacity
          onPress={() => respondToFriendRequest(item.id, 'accepted')}
          className="flex-1 bg-green-500 rounded-xl py-3 items-center"
        >
          <Text className="text-white font-bold">Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => respondToFriendRequest(item.id, 'rejected')}
          className="flex-1 bg-red-500 rounded-xl py-3 items-center"
        >
          <Text className="text-white font-bold">Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="px-6 py-4 flex-row items-center justify-between">
        <View>
          <Text className="text-white text-3xl font-bold">Friends</Text>
          <Text className="text-gray-400 text-sm">{friends.length} friends</Text>
        </View>
        <View className="flex-row space-x-3">
          {friendRequests.length > 0 && (
            <View className="relative">
              <View className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full items-center justify-center z-10">
                <Text className="text-white text-xs font-bold">{friendRequests.length}</Text>
              </View>
              <TouchableOpacity 
                onPress={() => setShowSearchModal(true)}
                className="w-12 h-12 bg-yellow-500 rounded-full items-center justify-center"
              >
                <Feather name="user-plus" size={20} color="white" />
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity 
            onPress={() => setShowSearchModal(true)}
            className="w-12 h-12 bg-blue-500 rounded-full items-center justify-center"
          >
            <Feather name="search" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Friends List */}
      <View className="flex-1">
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-white text-lg">Loading friends...</Text>
          </View>
        ) : friends.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <View className="w-32 h-32 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full items-center justify-center mb-8">
              <Feather name="users" size={60} color="white" />
            </View>
            <Text className="text-white text-2xl font-bold text-center mb-4">No Friends Yet</Text>
            <Text className="text-gray-400 text-center text-lg">
              Start connecting with people to build your friend network
            </Text>
          </View>
        ) : (
          <FlatList
            data={friends}
            renderItem={renderFriend}
            keyExtractor={(item) => `${item.user_id}-${item.friend_id}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 100 }}
          />
        )}
      </View>

      {/* Search Modal */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView className="flex-1 bg-black">
          {/* Modal Header */}
          <View className="px-6 py-4 flex-row items-center justify-between border-b border-gray-800">
            <Text className="text-white text-2xl font-bold">Search & Requests</Text>
            <TouchableOpacity 
              onPress={() => {
                setShowSearchModal(false)
                setSearchQuery('')
                setSearchResults([])
              }}
              className="w-10 h-10 bg-gray-800 rounded-full items-center justify-center"
            >
              <Feather name="x" size={20} color="white" />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View className="px-6 py-4">
            <View className="bg-gray-800 rounded-xl px-4 py-3 flex-row items-center">
              <Feather name="search" size={20} color="gray" />
              <TextInput
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text)
                  searchUsers(text)
                }}
                placeholder="Search for users..."
                placeholderTextColor="gray"
                className="flex-1 text-white text-lg ml-3"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Content */}
          <View className="flex-1">
            {/* Friend Requests Section */}
            {friendRequests.length > 0 && (
              <View>
                <Text className="text-white text-xl font-bold px-6 py-2">Friend Requests</Text>
                <FlatList
                  data={friendRequests}
                  renderItem={renderFriendRequest}
                  keyExtractor={(item) => item.id.toString()}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}

            {/* Search Results Section */}
            {searchQuery.trim() !== '' && (
              <View className="flex-1">
                <Text className="text-white text-xl font-bold px-6 py-2">Search Results</Text>
                {searchLoading ? (
                  <View className="flex-1 items-center justify-center">
                    <Text className="text-white text-lg">Searching...</Text>
                  </View>
                ) : searchResults.length === 0 ? (
                  <View className="flex-1 items-center justify-center px-8">
                    <Text className="text-gray-400 text-lg text-center">No users found</Text>
                  </View>
                ) : (
                  <FlatList
                    data={searchResults}
                    renderItem={renderSearchResult}
                    keyExtractor={(item) => item.user_id}
                    showsVerticalScrollIndicator={false}
                  />
                )}
              </View>
            )}

            {/* Empty State */}
            {searchQuery.trim() === '' && friendRequests.length === 0 && (
              <View className="flex-1 items-center justify-center px-8">
                <View className="w-32 h-32 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full items-center justify-center mb-8">
                  <Feather name="search" size={60} color="white" />
                </View>
                <Text className="text-white text-2xl font-bold text-center mb-4">Search for Friends</Text>
                <Text className="text-gray-400 text-center text-lg">
                  Type a username or display name to find people to connect with
                </Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}
