import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Alert } from 'react-native';
import GifLoadingIndicator from '../../components/GifLoadingIndicator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function SearchFriendsPage() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentRequests, setSentRequests] = useState<string[]>([]);

  const searchUsers = async () => {
    if (!searchQuery.trim() || !user) return;
    
    setSearching(true);
    try {
      // Get existing friends and pending requests
      const { data: friends } = await supabase
        .from('friends')
        .select('friend_id')
        .eq('user_id', user.id);
      
      const { data: pendingRequests } = await supabase
        .from('friend_requests')
        .select('to_user_id')
        .eq('from_user_id', user.id)
        .eq('status', 'pending');
      
      const friendIds = friends?.map(f => f.friend_id) || [];
      const pendingIds = pendingRequests?.map(r => r.to_user_id) || [];
      const excludeIds = [...friendIds, ...pendingIds, user.id];
      
      // Search for users
      const { data: users, error } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .ilike('username', `%${searchQuery}%`)
        .not('user_id', 'in', `(${excludeIds.join(',')})`)
        .limit(20);
      
      if (error) throw error;
      
      setSearchResults(users || []);
    } catch (error) {
      console.error('Error searching users:', error);
      Alert.alert('Error', 'Failed to search users');
    } finally {
      setSearching(false);
    }
  };

  const sendFriendRequest = async (toUserId: string, username: string) => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          from_user_id: user.id,
          to_user_id: toUserId,
          status: 'pending'
        });
      
      if (error) {
        if (error.code === '23505') { // Duplicate
          Alert.alert('Already Sent', 'You already sent a friend request to this user');
        } else {
          throw error;
        }
      } else {
        setSentRequests([...sentRequests, toUserId]);
        Alert.alert('Success', `Friend request sent to ${username}`);
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      Alert.alert('Error', 'Failed to send friend request');
    }
  };

  const renderUser = ({ item }: { item: any }) => (
    <View className="flex-row items-center p-4 border-b border-gray-800">
      <View className="w-10 h-10 rounded-full bg-gray-600 items-center justify-center mr-3">
        <Feather name="user" size={18} color="white" />
      </View>
      <Text className="text-white flex-1">{item.username}</Text>
      {sentRequests.includes(item.user_id) ? (
        <View className="bg-gray-700 px-4 py-2 rounded-full">
          <Text className="text-gray-400 text-sm">Sent</Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => sendFriendRequest(item.user_id, item.username)}
          className="bg-blue-500 px-4 py-2 rounded-full"
        >
          <Text className="text-white font-medium">Add</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center p-4 border-b border-gray-800">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Feather name="arrow-left" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold">Search Friends</Text>
      </View>

      {/* Search Input */}
      <View className="p-4">
        <View className="flex-row items-center bg-gray-800 rounded-full px-4">
          <Feather name="search" size={20} color="#9CA3AF" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={searchUsers}
            placeholder="Search by username"
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-white py-3 px-2"
            autoFocus
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Search Results */}
      {searching ? (
        <View className="flex-1 justify-center items-center">
                      <GifLoadingIndicator size="large" color="white" />
        </View>
      ) : (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.user_id}
          renderItem={renderUser}
          ListEmptyComponent={
            searchQuery.length > 0 && !searching ? (
              <View className="p-8 items-center">
                <Feather name="search" size={48} color="gray" />
                <Text className="text-gray-400 text-center mt-4">
                  No users found
                </Text>
                <Text className="text-gray-500 text-sm text-center mt-2">
                  Try searching with a different username
                </Text>
              </View>
            ) : (
              <View className="p-8 items-center">
                <Feather name="search" size={48} color="gray" />
                <Text className="text-gray-400 text-center mt-4">
                  Search for friends by username
                </Text>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
} 