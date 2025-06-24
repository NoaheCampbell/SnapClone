import { View, Text, TextInput, TouchableOpacity, FlatList, Alert } from 'react-native'
import React, { useState, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../../lib/supabase'

interface Profile {
  user_id: string
  username: string
  display_name?: string
  avatar_url?: string
  created_at: string
}

interface FriendRequest {
  id: number
  from_id: string
  to_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  from_profile: Profile
}

interface Friend {
  user_id: string
  friend_id: string
  created_at: string
  friend_profile: Profile
}

export default function FriendsScreen() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'search'>('friends')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTimeout, setSearchTimeout] = useState<number | null>(null)

  useEffect(() => {
    if (user) {
      loadFriends()
      loadFriendRequests()
    }
  }, [user])

  // Debounced search effect
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout)
    }

    if (searchQuery.trim()) {
      const timeout = setTimeout(() => {
        searchUsers(searchQuery)
      }, 500) // 500ms debounce
      setSearchTimeout(timeout)
    } else {
      setSearchResults([])
    }

    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout)
      }
    }
  }, [searchQuery])

  const loadFriends = async () => {
    if (!user) return

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

    setLoading(true)
    
    try {
      // Get all profiles and filter locally
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
          .filter(profile => profile.user_id !== user.id) // Filter out current user
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
      setLoading(false)
    }
  }

  const sendFriendRequest = async (toUserId: string) => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          from_id: user.id,
          to_id: toUserId,
          status: 'pending'
        })

      if (error) {
        if (error.code === '23505') {
          Alert.alert('Request Already Sent', 'You have already sent a friend request to this user.')
        } else {
          Alert.alert('Error', 'Failed to send friend request')
        }
      } else {
        Alert.alert('Success', 'Friend request sent!')
        // Remove from search results
        setSearchResults(prev => prev.filter(p => p.user_id !== toUserId))
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to send friend request')
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
        // Add to friends table (bidirectional)
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
    <View className="mx-4 mb-4 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden">
      <View className="flex-row items-center p-5">
        <View className="relative">
          <View className="w-16 h-16 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl items-center justify-center shadow-xl">
            <Text className="text-white text-xl font-bold">
              {(item.friend_profile.display_name || item.friend_profile.username).charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-black"></View>
        </View>
        <View className="ml-4 flex-1">
          <Text className="text-white font-bold text-lg">{item.friend_profile.display_name || item.friend_profile.username}</Text>
          <Text className="text-gray-300 text-sm">@{item.friend_profile.username}</Text>
          <Text className="text-gray-400 text-xs mt-1">Online</Text>
        </View>
        <TouchableOpacity
          onPress={() => removeFriend(item.friend_id)}
          className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-2xl items-center justify-center"
        >
          <Feather name="user-minus" size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  )

  const renderFriendRequest = ({ item }: { item: FriendRequest }) => (
    <View className="mx-4 mb-4 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden">
      <View className="p-5">
        <View className="flex-row items-center mb-4">
          <View className="relative">
            <View className="w-16 h-16 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 rounded-2xl items-center justify-center shadow-xl">
              <Text className="text-white text-xl font-bold">
                {(item.from_profile.display_name || item.from_profile.username).charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full border-2 border-black items-center justify-center">
              <Feather name="user-plus" size={12} color="white" />
            </View>
          </View>
          <View className="ml-4 flex-1">
            <Text className="text-white font-bold text-lg">{item.from_profile.display_name || item.from_profile.username}</Text>
            <Text className="text-gray-300 text-sm">@{item.from_profile.username}</Text>
            <Text className="text-blue-400 text-xs mt-1">wants to be your friend</Text>
          </View>
        </View>
        <View className="flex-row space-x-3">
          <TouchableOpacity
            onPress={() => respondToFriendRequest(item.id, 'accepted')}
            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl py-4 items-center shadow-lg"
          >
            <Text className="text-white font-bold text-base">Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => respondToFriendRequest(item.id, 'rejected')}
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-4 items-center"
          >
            <Text className="text-gray-300 font-bold text-base">Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )

  const renderSearchResult = ({ item }: { item: Profile }) => (
    <View className="mx-4 mb-4 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden">
      <View className="flex-row items-center p-5">
        <View className="w-16 h-16 bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 rounded-2xl items-center justify-center shadow-xl">
          <Text className="text-white text-xl font-bold">
            {(item.display_name || item.username).charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="ml-4 flex-1">
          <Text className="text-white font-bold text-lg">{item.display_name || item.username}</Text>
          <Text className="text-gray-300 text-sm">@{item.username}</Text>
          <Text className="text-gray-400 text-xs mt-1">Tap to add friend</Text>
        </View>
        <TouchableOpacity
          onPress={() => sendFriendRequest(item.user_id)}
          className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 rounded-2xl shadow-lg"
        >
          <Text className="text-white font-bold text-base">Add</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Animated Background */}
      <View className="absolute inset-0">
        <View className="absolute top-0 left-0 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl" />
        <View className="absolute top-32 right-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />
        <View className="absolute bottom-32 left-8 w-56 h-56 bg-pink-500/20 rounded-full blur-3xl" />
      </View>
      
      <View className="flex-1 relative">
        {/* Header */}
        <View className="px-6 py-6 bg-black/20 backdrop-blur-2xl border-b border-white/10">
          <View className="flex-row items-center justify-between mb-6">
            <View>
              <Text className="text-white text-4xl font-black tracking-tight">Friends</Text>
              <Text className="text-gray-400 text-sm mt-1">Connect with your network</Text>
            </View>
            <TouchableOpacity 
              onPress={() => router.push('/(modals)/settings')}
              className="w-12 h-12 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl items-center justify-center"
            >
              <Feather name="settings" size={20} color="white" />
            </TouchableOpacity>
          </View>
          
          {/* Enhanced Tab Navigation */}
          <View className="flex-row bg-black/30 backdrop-blur-2xl rounded-3xl p-2 border border-white/10">
            <TouchableOpacity
              onPress={() => setActiveTab('friends')}
              className={`flex-1 py-4 rounded-2xl transition-all duration-300 ${
                activeTab === 'friends' 
                  ? 'bg-white/20 backdrop-blur-xl shadow-2xl' 
                  : 'bg-transparent'
              }`}
            >
              <Text className={`text-center font-bold ${
                activeTab === 'friends' ? 'text-white' : 'text-gray-400'
              }`}>
                Friends
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('requests')}
              className={`flex-1 py-4 rounded-2xl relative transition-all duration-300 ${
                activeTab === 'requests' 
                  ? 'bg-white/20 backdrop-blur-xl shadow-2xl' 
                  : 'bg-transparent'
              }`}
            >
              <Text className={`text-center font-bold ${
                activeTab === 'requests' ? 'text-white' : 'text-gray-400'
              }`}>
                Requests
              </Text>
              {friendRequests.length > 0 && (
                <View className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-r from-red-500 to-pink-500 rounded-full items-center justify-center shadow-lg border-2 border-black">
                  <Text className="text-white text-xs font-black">{friendRequests.length}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('search')}
              className={`flex-1 py-4 rounded-2xl transition-all duration-300 ${
                activeTab === 'search' 
                  ? 'bg-white/20 backdrop-blur-xl shadow-2xl' 
                  : 'bg-transparent'
              }`}
            >
              <Text className={`text-center font-bold ${
                activeTab === 'search' ? 'text-white' : 'text-gray-400'
              }`}>
                Search
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Enhanced Search Bar */}
        {activeTab === 'search' && (
          <View className="px-6 py-4">
            <View className="bg-black/30 backdrop-blur-2xl rounded-3xl px-6 py-5 flex-row items-center border border-white/10 shadow-2xl">
              <View className="w-8 h-8 bg-white/10 rounded-full items-center justify-center mr-4">
                <Feather name="search" size={16} color="white" />
              </View>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search for friends..."
                placeholderTextColor="#6B7280"
                className="flex-1 text-white text-lg font-medium"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        )}

        {/* Content */}
        <View className="flex-1">
          {activeTab === 'friends' && (
            <View className="flex-1">
              {friends.length === 0 ? (
                <View className="flex-1 items-center justify-center px-8">
                  <View className="w-40 h-40 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-full items-center justify-center mb-12 shadow-2xl">
                    <Feather name="users" size={80} color="white" />
                  </View>
                  <Text className="text-white text-3xl font-black text-center mb-6">Your Friend Circle Awaits</Text>
                  <Text className="text-gray-300 text-center text-lg leading-relaxed mb-12 max-w-sm">
                    Start building meaningful connections and expand your social network
                  </Text>
                  <TouchableOpacity
                    onPress={() => setActiveTab('search')}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 px-12 py-5 rounded-3xl shadow-2xl"
                  >
                    <Text className="text-white font-black text-xl">Discover Friends</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <FlatList
                  data={friends}
                  renderItem={renderFriend}
                  keyExtractor={(item) => `${item.user_id}-${item.friend_id}`}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
                />
              )}
            </View>
          )}

          {activeTab === 'requests' && (
            <View className="flex-1">
              {friendRequests.length === 0 ? (
                <View className="flex-1 items-center justify-center px-8">
                  <View className="w-40 h-40 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 rounded-full items-center justify-center mb-12 shadow-2xl">
                    <Feather name="user-plus" size={80} color="white" />
                  </View>
                  <Text className="text-white text-3xl font-black text-center mb-6">No Pending Requests</Text>
                  <Text className="text-gray-300 text-center text-lg leading-relaxed max-w-sm">
                    When someone wants to connect with you, their request will appear here
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={friendRequests}
                  renderItem={renderFriendRequest}
                  keyExtractor={(item) => item.id.toString()}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
                />
              )}
            </View>
          )}

          {activeTab === 'search' && (
            <View className="flex-1">
              {searchQuery.trim() === '' ? (
                <View className="flex-1 items-center justify-center px-8">
                  <View className="w-40 h-40 bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-500 rounded-full items-center justify-center mb-12 shadow-2xl">
                    <Feather name="compass" size={80} color="white" />
                  </View>
                  <Text className="text-white text-3xl font-black text-center mb-6">Discover New People</Text>
                  <Text className="text-gray-300 text-center text-lg leading-relaxed max-w-sm">
                    Search by username or display name to find friends and connect with them
                  </Text>
                </View>
              ) : loading ? (
                <View className="flex-1 items-center justify-center">
                  <View className="w-32 h-32 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full items-center justify-center mb-8 shadow-2xl">
                    <Feather name="search" size={64} color="white" />
                  </View>
                  <Text className="text-white text-2xl font-bold">Searching...</Text>
                  <Text className="text-gray-400 text-lg mt-2">Finding amazing people</Text>
                </View>
              ) : searchResults.length === 0 ? (
                <View className="flex-1 items-center justify-center px-8">
                  <View className="w-40 h-40 bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 rounded-full items-center justify-center mb-12 shadow-2xl">
                    <Feather name="search" size={80} color="white" />
                  </View>
                  <Text className="text-white text-3xl font-black text-center mb-6">No Results Found</Text>
                  <Text className="text-gray-300 text-center text-lg leading-relaxed max-w-sm">
                    Try searching with a different username or display name
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={searchResults}
                  renderItem={renderSearchResult}
                  keyExtractor={(item) => item.user_id}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
                />
              )}
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}
