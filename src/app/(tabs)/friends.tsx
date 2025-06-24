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
      // Test profiles access
      testProfilesAccess()
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

  const testProfilesAccess = async () => {
    console.log('Testing profiles access...')
    try {
      // Check what RLS policies exist on the profiles table
      console.log('Checking existing RLS policies...')
      try {
        const { data: policies, error: policiesError } = await supabase
          .from('pg_policies')
          .select('*')
          .eq('tablename', 'profiles')
          
        console.log('Existing policies on profiles table:', policies)
        console.log('Policies query error:', policiesError)
      } catch (policiesErr) {
        console.log('Could not query policies (expected):', policiesErr)
      }

      // Try to manually create the RLS policy
      console.log('Attempting to create RLS policy manually...')
      
      try {
        // This might work if we have the right permissions
        const { data: policyData, error: policyError } = await supabase
          .from('profiles')
          .select('*')
          .limit(0) // We don't want data, just to test if we can modify
          
        console.log('Policy test result:', policyData)
        console.log('Policy test error:', policyError)
      } catch (policyErr) {
        console.log('Policy creation failed:', policyErr)
      }

      // Test 1: Basic profile query with limit
      console.log('Test 1: Basic query with limit')
      const { data: test1, error: error1 } = await supabase
        .from('profiles')
        .select('user_id, username, display_name')
        .limit(10)

      console.log('Test 1 result:', test1)
      console.log('Test 1 error:', error1)
      
      // Test 2: Query without limit
      console.log('Test 2: Query without limit')
      const { data: test2, error: error2 } = await supabase
        .from('profiles')
        .select('user_id, username, display_name')

      console.log('Test 2 result:', test2)
      console.log('Test 2 error:', error2)
      
      // Test 3: Query with different select
      console.log('Test 3: Query with *')
      const { data: test3, error: error3 } = await supabase
        .from('profiles')
        .select('*')

      console.log('Test 3 result:', test3)
      console.log('Test 3 error:', error3)
      
      // Test 4: Our own profile
      console.log('Test 4: Own profile')
      const { data: ownProfile, error: ownError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .single()
        
      console.log('Own profile:', ownProfile)
      console.log('Own profile error:', ownError)

      // Test 5: Count total profiles
      console.log('Test 5: Count all profiles')
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })

      console.log('Total profiles count:', count)
      console.log('Count error:', countError)
    } catch (error) {
      console.log('Test profiles access error:', error)
    }
  }

  const searchUsers = async (query: string) => {
    if (!query.trim() || !user) {
      setSearchResults([])
      return
    }

    setLoading(true)
    console.log('Searching for:', query)
    console.log('Current user:', user)
    console.log('User ID:', user.id)
    
    try {
      // Check current session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      console.log('Current session:', sessionData)
      console.log('Session error:', sessionError)

      // First, let's try a simple approach - get all profiles and filter locally
      const { data: allProfiles, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('user_id', user.id)

      console.log('All profiles:', allProfiles)
      console.log('Error:', error)
      console.log('Error details:', error?.message, error?.details, error?.hint)

      if (error) {
        console.error('Error fetching profiles:', error)
        
        // Try without the neq filter to see if that's the issue
        console.log('Trying without user filter...')
        const { data: allProfilesNoFilter, error: noFilterError } = await supabase
          .from('profiles')
          .select('*')
        
        console.log('All profiles (no filter):', allProfilesNoFilter)
        console.log('No filter error:', noFilterError)
        
        setSearchResults([])
        return
      }

      if (allProfiles) {
        const searchTerm = query.trim().toLowerCase()
        const filtered = allProfiles
          // Temporarily allow searching for your own profile for testing
          // .filter(profile => profile.user_id !== user.id) // Filter out current user locally
          .filter(profile => {
            const usernameMatch = profile.username?.toLowerCase().includes(searchTerm)
            const displayNameMatch = profile.display_name?.toLowerCase().includes(searchTerm)
            console.log(`Checking ${profile.username}: username match=${usernameMatch}, display name match=${displayNameMatch}`)
            return usernameMatch || displayNameMatch
          })
        
        console.log('Filtered results:', filtered)
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
    <View className="flex-row items-center justify-between p-4 bg-gray-800 rounded-xl mb-3">
      <View className="flex-row items-center flex-1">
        <View className="w-12 h-12 bg-gray-600 rounded-full items-center justify-center">
          <Feather name="user" size={20} color="white" />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-white font-semibold">{item.friend_profile.display_name || item.friend_profile.username}</Text>
          <Text className="text-gray-400 text-sm">@{item.friend_profile.username}</Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => removeFriend(item.friend_id)}
        className="p-2"
      >
        <Feather name="user-minus" size={20} color="#ef4444" />
      </TouchableOpacity>
    </View>
  )

  const renderFriendRequest = ({ item }: { item: FriendRequest }) => (
    <View className="p-4 bg-gray-800 rounded-xl mb-3">
      <View className="flex-row items-center mb-3">
        <View className="w-12 h-12 bg-gray-600 rounded-full items-center justify-center">
          <Feather name="user" size={20} color="white" />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-white font-semibold">{item.from_profile.display_name || item.from_profile.username}</Text>
          <Text className="text-gray-400 text-sm">@{item.from_profile.username}</Text>
        </View>
      </View>
      <View className="flex-row space-x-3">
        <TouchableOpacity
          onPress={() => respondToFriendRequest(item.id, 'accepted')}
          className="flex-1 bg-blue-500 rounded-lg py-2 items-center"
        >
          <Text className="text-white font-semibold">Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => respondToFriendRequest(item.id, 'rejected')}
          className="flex-1 bg-gray-600 rounded-lg py-2 items-center"
        >
          <Text className="text-white font-semibold">Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  const renderSearchResult = ({ item }: { item: Profile }) => (
    <View className="flex-row items-center justify-between p-4 bg-gray-800 rounded-xl mb-3">
      <View className="flex-row items-center flex-1">
        <View className="w-12 h-12 bg-gray-600 rounded-full items-center justify-center">
          <Feather name="user" size={20} color="white" />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-white font-semibold">{item.display_name || item.username}</Text>
          <Text className="text-gray-400 text-sm">@{item.username}</Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => sendFriendRequest(item.user_id)}
        className="bg-blue-500 px-4 py-2 rounded-lg"
      >
        <Text className="text-white font-semibold">Add</Text>
      </TouchableOpacity>
    </View>
  )

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 px-4">
        {/* Header */}
        <View className="flex-row items-center justify-between py-4">
          <Text className="text-white text-2xl font-bold">Friends</Text>
          <View className="flex-row items-center space-x-4">
            <TouchableOpacity 
              onPress={() => router.push('/(modals)/settings')}
              className="p-2"
            >
              <Feather name="settings" size={24} color="white" />
            </TouchableOpacity>
            <View className="flex-row bg-gray-800 rounded-lg p-1">
              <TouchableOpacity
                onPress={() => setActiveTab('friends')}
                className={`px-3 py-1 rounded-md ${activeTab === 'friends' ? 'bg-blue-500' : ''}`}
              >
                <Text className={`text-sm font-medium ${activeTab === 'friends' ? 'text-white' : 'text-gray-400'}`}>
                  Friends
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab('requests')}
                className={`px-3 py-1 rounded-md relative ${activeTab === 'requests' ? 'bg-blue-500' : ''}`}
              >
                <Text className={`text-sm font-medium ${activeTab === 'requests' ? 'text-white' : 'text-gray-400'}`}>
                  Requests
                </Text>
                {friendRequests.length > 0 && (
                  <View className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full items-center justify-center">
                    <Text className="text-white text-xs">{friendRequests.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab('search')}
                className={`px-3 py-1 rounded-md ${activeTab === 'search' ? 'bg-blue-500' : ''}`}
              >
                <Text className={`text-sm font-medium ${activeTab === 'search' ? 'text-white' : 'text-gray-400'}`}>
                  Search
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Search Bar (only show on search tab) */}
        {activeTab === 'search' && (
          <View className="mb-4">
            <View className="bg-gray-800 rounded-xl px-4 py-3 flex-row items-center">
              <Feather name="search" size={20} color="gray" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by username or name..."
                placeholderTextColor="gray"
                className="flex-1 text-white text-base ml-3"
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
                <View className="flex-1 items-center justify-center">
                  <Feather name="users" size={64} color="gray" />
                  <Text className="text-gray-400 text-lg mt-4">No friends yet</Text>
                  <Text className="text-gray-500 text-center mt-2">
                    Search for people to add as friends
                  </Text>
                  <TouchableOpacity
                    onPress={() => setActiveTab('search')}
                    className="bg-blue-500 px-6 py-3 rounded-lg mt-4"
                  >
                    <Text className="text-white font-semibold">Find Friends</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <FlatList
                  data={friends}
                  renderItem={renderFriend}
                  keyExtractor={(item) => `${item.user_id}-${item.friend_id}`}
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>
          )}

          {activeTab === 'requests' && (
            <View className="flex-1">
              {friendRequests.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                  <Feather name="inbox" size={64} color="gray" />
                  <Text className="text-gray-400 text-lg mt-4">No friend requests</Text>
                  <Text className="text-gray-500 text-center mt-2">
                    Friend requests will appear here
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={friendRequests}
                  renderItem={renderFriendRequest}
                  keyExtractor={(item) => item.id.toString()}
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>
          )}

          {activeTab === 'search' && (
            <View className="flex-1">
              {searchQuery.trim() === '' ? (
                <View className="flex-1 items-center justify-center">
                  <Feather name="search" size={64} color="gray" />
                  <Text className="text-gray-400 text-lg mt-4">Search for friends</Text>
                  <Text className="text-gray-500 text-center mt-2">
                    Enter a username or name to find people
                  </Text>
                </View>
              ) : loading ? (
                <View className="flex-1 items-center justify-center">
                  <Text className="text-gray-400">Searching...</Text>
                </View>
              ) : searchResults.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                  <Feather name="user-x" size={64} color="gray" />
                  <Text className="text-gray-400 text-lg mt-4">No users found</Text>
                  <Text className="text-gray-500 text-center mt-2">
                    Try a different search term
                  </Text>
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
        </View>
      </View>
    </SafeAreaView>
  )
}
