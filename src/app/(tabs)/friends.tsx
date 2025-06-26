import { View, Text, FlatList, TouchableOpacity, Alert, Image, Modal, TextInput, ActivityIndicator, ScrollView } from 'react-native'
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
  is_private?: boolean
  allow_friend_requests?: boolean
  show_stories_to_friends_only?: boolean
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

interface CircleSuggestion {
  id: string
  name: string
  member_count: number
  recent_activity: number
  score: number
  similarity_reason: string
}

export default function FriendsScreen() {
  const { user } = useAuth()
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [circleSuggestions, setCircleSuggestions] = useState<CircleSuggestion[]>([])
  const [loadingCircleSuggestions, setLoadingCircleSuggestions] = useState(false)
  const [activeTab, setActiveTab] = useState<'friends' | 'circles'>('friends')

  useEffect(() => {
    if (user) {
      loadFriends()
      loadFriendRequests()
      if (activeTab === 'circles') {
        loadCircleSuggestions()
      }
    }
  }, [user, activeTab])

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

  const loadCircleSuggestions = async () => {
    if (!user || loadingCircleSuggestions) return

    setLoadingCircleSuggestions(true)
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generateCircleSuggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          userId: user.id
        })
      })

      if (response.ok) {
        const result = await response.json()
        setCircleSuggestions(result.suggestions || [])
      } else {
        console.error('Failed to load circle suggestions')
        setCircleSuggestions([])
      }
    } catch (error) {
      console.error('Error loading circle suggestions:', error)
      setCircleSuggestions([])
    } finally {
      setLoadingCircleSuggestions(false)
    }
  }

  const searchUsers = async (query: string) => {
    if (!query.trim() || !user) {
      setSearchResults([])
      return
    }

    setSearchLoading(true)
    
    try {
      // Get current user's friends list to check if private accounts are already friends
      const { data: friendsData } = await supabase
        .from('friends')
        .select('friend_id')
        .eq('user_id', user.id);

      const friendIds = new Set(friendsData?.map(f => f.friend_id) || []);

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
          // Filter out private accounts that don't allow friend requests
          .filter(profile => {
            // If allow_friend_requests is false, don't show in search
            return profile.allow_friend_requests !== false
          })
          // Filter out private accounts unless they're already friends
          .filter(profile => {
            // If account is private and user is not already a friend, don't show in search
            if (profile.is_private && !friendIds.has(profile.user_id)) {
              return false
            }
            return true
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
      const { data: targetProfile, error: profileError } = await supabase
        .from('profiles')
        .select('allow_friend_requests, username')
        .eq('user_id', toUserId)
        .single()

      if (profileError) {
        console.error('Error checking user profile:', profileError)
        Alert.alert('Error', 'Failed to send friend request.')
        return
      }

      if (targetProfile.allow_friend_requests === false) {
        Alert.alert('Cannot Send Request', `${targetProfile.username || 'This user'} is not accepting friend requests.`)
        return
      }

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

  const joinCircle = async (circleId: string) => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('circle_members')
        .insert({
          circle_id: circleId,
          user_id: user.id,
          role: 'member'
        })

      if (error) {
        if (error.message.includes('duplicate key')) {
          Alert.alert('Already a Member', 'You are already a member of this circle.')
        } else {
          Alert.alert('Error', 'Failed to join circle. Please try again.')
        }
      } else {
        Alert.alert('Success', 'Successfully joined the circle!')
        // Remove the suggestion from the list
        setCircleSuggestions(prev => prev.filter(s => s.id !== circleId))
      }
    } catch (error) {
      console.error('Error joining circle:', error)
      Alert.alert('Error', 'Failed to join circle. Please try again.')
    }
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
          <Image 
            source={require('../../../assets/images/avatar-placeholder.png')} 
            className="w-16 h-16 rounded-full"
            resizeMode="cover"
          />
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
          <Image 
            source={require('../../../assets/images/avatar-placeholder.png')} 
            className="w-16 h-16 rounded-full"
            resizeMode="cover"
          />
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
            <Image 
              source={require('../../../assets/images/avatar-placeholder.png')} 
              className="w-16 h-16 rounded-full"
              resizeMode="cover"
            />
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

  const renderCircleSuggestion = ({ item }: { item: CircleSuggestion }) => (
    <View className="mx-6 mb-4 bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4">
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-1">
          <Text className="text-white text-lg font-bold mb-1">{item.name}</Text>
          <Text className="text-purple-400 text-sm mb-2">{item.similarity_reason}</Text>
          <View className="flex-row items-center space-x-4">
            <View className="flex-row items-center">
              <Feather name="users" size={12} color="#9CA3AF" />
              <Text className="text-gray-400 text-xs ml-1">
                {item.member_count} members
              </Text>
            </View>
            <View className="flex-row items-center">
              <Feather name="activity" size={12} color="#9CA3AF" />
              <Text className="text-gray-400 text-xs ml-1">
                {item.recent_activity} recent sprints
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => joinCircle(item.id)}
          className="bg-purple-600 rounded-lg px-4 py-2 ml-3"
        >
          <Text className="text-white text-sm font-medium">Join</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="px-6 py-4 flex-row items-center justify-between">
        <View>
          <Text className="text-white text-3xl font-bold">
            {activeTab === 'friends' ? 'Friends' : 'Discover Circles'}
          </Text>
          <Text className="text-gray-400 text-sm">
            {activeTab === 'friends' 
              ? `${friends.length} friends` 
              : 'Find study groups based on your interests'
            }
          </Text>
        </View>
        <View className="flex-row space-x-3">
          {activeTab === 'friends' && friendRequests.length > 0 && (
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
          {activeTab === 'friends' && (
            <TouchableOpacity 
              onPress={() => setShowSearchModal(true)}
              className="w-12 h-12 bg-blue-500 rounded-full items-center justify-center"
            >
              <Feather name="search" size={20} color="white" />
            </TouchableOpacity>
          )}
          {activeTab === 'circles' && (
            <TouchableOpacity 
              onPress={loadCircleSuggestions}
              disabled={loadingCircleSuggestions}
              className="w-12 h-12 bg-purple-500 rounded-full items-center justify-center"
            >
              <Feather 
                name={loadingCircleSuggestions ? "loader" : "refresh-cw"} 
                size={20} 
                color="white" 
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab Navigation */}
      <View className="px-6 mb-4">
        <View className="flex-row bg-gray-900 rounded-xl p-1">
          <TouchableOpacity
            onPress={() => setActiveTab('friends')}
            className={`flex-1 py-3 px-4 rounded-lg ${
              activeTab === 'friends' ? 'bg-blue-500' : 'bg-transparent'
            }`}
          >
            <Text className={`text-center font-semibold ${
              activeTab === 'friends' ? 'text-white' : 'text-gray-400'
            }`}>
              Friends
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('circles')}
            className={`flex-1 py-3 px-4 rounded-lg ${
              activeTab === 'circles' ? 'bg-purple-500' : 'bg-transparent'
            }`}
          >
            <Text className={`text-center font-semibold ${
              activeTab === 'circles' ? 'text-white' : 'text-gray-400'
            }`}>
              Discover Circles
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content Area */}
      <View className="flex-1">
        {activeTab === 'friends' ? (
          // Friends Tab
          loading ? (
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
          )
        ) : (
          // Circles Tab
          loadingCircleSuggestions ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#A855F7" />
              <Text className="text-white text-lg mt-4">Finding circles for you...</Text>
              <Text className="text-gray-400 text-sm mt-2 text-center px-8">
                Using AI to match you with study groups based on your interests
              </Text>
            </View>
          ) : circleSuggestions.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <View className="w-32 h-32 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full items-center justify-center mb-8">
                <Feather name="compass" size={60} color="white" />
              </View>
              <Text className="text-white text-2xl font-bold text-center mb-4">No Suggestions Yet</Text>
              <Text className="text-gray-400 text-center text-lg mb-6">
                Complete a few study sprints to get personalized circle recommendations
              </Text>
              <TouchableOpacity
                onPress={loadCircleSuggestions}
                className="bg-purple-500 px-6 py-3 rounded-xl"
              >
                <Text className="text-white font-semibold">Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="px-6 py-4">
                <Text className="text-purple-400 text-sm mb-4">
                  🎯 Based on your study history and interests
                </Text>
              </View>
              <FlatList
                data={circleSuggestions}
                renderItem={renderCircleSuggestion}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                contentContainerStyle={{ paddingBottom: 100 }}
              />
            </ScrollView>
          )
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
