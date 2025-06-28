import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  Alert,
  TextInput,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';

interface PublicCircle {
  id: string;
  name: string;
  owner_username: string;
  member_count: number;
  sprint_minutes: number;
  ttl_minutes: number;
  created_at: string;
  is_member: boolean;
}

export default function DiscoverCirclesScreen() {
  const [circles, setCircles] = useState<PublicCircle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [joiningByCode, setJoiningByCode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allCircles, setAllCircles] = useState<PublicCircle[]>([]);
  const [filteredCircles, setFilteredCircles] = useState<PublicCircle[]>([]);

  useEffect(() => {
    loadPublicCircles();
  }, []);

  useEffect(() => {
    // Filter circles based on search query
    if (!searchQuery.trim()) {
      setFilteredCircles(allCircles);
    } else {
      const filtered = allCircles.filter(circle =>
        circle.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        circle.owner_username.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredCircles(filtered);
    }
  }, [searchQuery, allCircles]);

  const loadPublicCircles = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.rpc('get_public_circles', {
        p_limit: 50,
        p_offset: 0
      });

      if (error) throw error;
      setAllCircles(data || []);
      setCircles(data || []);
    } catch (error) {
      console.error('Error loading public circles:', error);
      Alert.alert('Error', 'Failed to load public circles');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPublicCircles();
    setRefreshing(false);
  };

  const joinCircle = async (circleId: string) => {
    try {
      setJoining(circleId);
      
      const { data, error } = await supabase.rpc('join_public_circle', {
        p_circle_id: circleId
      });

      if (error) throw error;

      if (data.error) {
        Alert.alert('Error', data.error);
        return;
      }

      Alert.alert(
        'Success',
        `You've joined "${data.circle_name}"!`,
        [
          {
            text: 'Open Circle',
            onPress: () => {
              router.back();
              router.push(`/(pages)/chat?circleId=${circleId}`);
            }
          },
          { text: 'OK' }
        ]
      );

      // Refresh the list to update membership status
      loadPublicCircles();
    } catch (error) {
      console.error('Error joining circle:', error);
      Alert.alert('Error', 'Failed to join circle');
    } finally {
      setJoining(null);
    }
  };

  const joinByInviteCode = async () => {
    if (!inviteCode.trim()) {
      Alert.alert('Error', 'Please enter an invite code');
      return;
    }

    try {
      setJoiningByCode(true);
      
      const { data, error } = await supabase.rpc('join_circle_by_invite', {
        p_invite_code: inviteCode.trim()
      });

      if (error) throw error;

      if (data.error) {
        Alert.alert('Error', data.error);
        return;
      }

      Alert.alert(
        'Success',
        `You've joined "${data.circle_name}"!`,
        [
          {
            text: 'Open Circle',
            onPress: () => {
              router.back();
              router.push(`/(pages)/chat?circleId=${data.circle_id}`);
            }
          },
          { text: 'OK' }
        ]
      );

      setInviteCode('');
      loadPublicCircles();
    } catch (error) {
      console.error('Error joining by invite code:', error);
      Alert.alert('Error', 'Failed to join circle');
    } finally {
      setJoiningByCode(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) {
      return 'Today';
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const renderCircleItem = ({ item }: { item: PublicCircle }) => (
    <View className="p-4 border-b border-gray-800 bg-gray-900 mx-4 my-2 rounded-lg">
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-1 pr-3">
          <View className="flex-row items-center mb-1 flex-wrap">
            <Text className="text-white font-semibold text-lg">{item.name}</Text>
            <Feather name="globe" size={14} color="#10B981" style={{ marginLeft: 8 }} />
            {item.is_member && (
              <View className="bg-green-500 px-2 py-1 rounded ml-2">
                <Text className="text-white text-xs font-semibold">JOINED</Text>
              </View>
            )}
          </View>
          <Text className="text-gray-400 text-sm">
            Created by @{item.owner_username} • {formatTime(item.created_at)}
          </Text>
        </View>
        
        <View className="ml-2">
          {item.is_member ? (
            <TouchableOpacity
              onPress={() => {
                router.back();
                router.push(`/(pages)/chat?circleId=${item.id}`);
              }}
              className="bg-gray-600 px-4 py-2 rounded-lg min-w-[60px]"
            >
              <Text className="text-white font-semibold text-center">Open</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => joinCircle(item.id)}
              disabled={joining === item.id}
              className="bg-blue-500 px-4 py-2 rounded-lg min-w-[60px]"
            >
              <Text className="text-white font-semibold text-center">
                {joining === item.id ? 'Joining...' : 'Join'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="flex-row items-center mr-4">
            <Feather name="users" size={14} color="#9CA3AF" />
            <Text className="text-gray-400 text-sm ml-1">
              {item.member_count} member{item.member_count !== 1 ? 's' : ''}
            </Text>
          </View>
          <View className="flex-row items-center mr-4">
            <Feather name="clock" size={14} color="#9CA3AF" />
            <Text className="text-gray-400 text-sm ml-1">
              {item.sprint_minutes}min sprints
            </Text>
          </View>
        </View>
        
        {/* Activity indicator */}
        <View className="flex-row items-center">
          <View className="w-2 h-2 bg-green-400 rounded-full mr-1" />
          <Text className="text-green-400 text-xs">Active</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-gray-800">
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold">Discover Circles</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Join by Invite Code */}
      <View className="p-4 border-b border-gray-800">
        <Text className="text-white text-lg font-bold mb-3">Join by Invite Code</Text>
        <View className="flex-row items-center">
          <TextInput
            value={inviteCode}
            onChangeText={setInviteCode}
            className="flex-1 bg-gray-800 text-white p-3 rounded-lg mr-3"
            placeholder="Enter invite code"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TouchableOpacity
            onPress={joinByInviteCode}
            disabled={joiningByCode || !inviteCode.trim()}
            className={`px-6 py-3 rounded-lg min-w-[80px] ${
              inviteCode.trim() && !joiningByCode ? 'bg-blue-500' : 'bg-gray-600'
            }`}
          >
            <Text className="text-white font-semibold text-center">
              {joiningByCode ? 'Joining...' : 'Join'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View className="p-4 border-b border-gray-800">
        <Text className="text-white text-lg font-bold mb-3">Search Public Circles</Text>
        <View className="flex-row items-center bg-gray-800 rounded-lg px-3 py-2">
          <Feather name="search" size={16} color="#9CA3AF" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-white ml-2"
            placeholder="Search by name or creator..."
            placeholderTextColor="#9CA3AF"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Public Circles List */}
      <View className="flex-1">
        <View className="p-4 border-b border-gray-800">
          <Text className="text-white text-lg font-bold">
            {searchQuery ? `Search Results (${filteredCircles.length})` : 'Public Circles'}
          </Text>
          <Text className="text-gray-400 text-sm mt-1">
            {searchQuery 
              ? `Showing results for "${searchQuery}"`
              : 'Discover and join public study circles'
            }
          </Text>
        </View>

        {filteredCircles.length > 0 ? (
          <FlatList
            data={filteredCircles}
            renderItem={renderCircleItem}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="white"
              />
            }
          />
        ) : (
          <View className="flex-1 justify-center items-center p-8">
            {loading ? (
              <Text className="text-white">Loading circles...</Text>
            ) : searchQuery ? (
              <>
                <Feather name="search" size={64} color="gray" />
                <Text className="text-gray-400 text-lg mt-4 text-center">
                  No circles match your search
                </Text>
                <Text className="text-gray-500 text-sm mt-2 text-center">
                  Try searching for different keywords
                </Text>
                <TouchableOpacity 
                  onPress={() => setSearchQuery('')}
                  className="bg-blue-500 px-4 py-2 rounded-lg mt-4"
                >
                  <Text className="text-white font-semibold">Clear Search</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Feather name="globe" size={64} color="gray" />
                <Text className="text-gray-400 text-lg mt-4 text-center">
                  No public circles found
                </Text>
                <Text className="text-gray-500 text-sm mt-2 text-center">
                  Be the first to create a public circle!
                </Text>
              </>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
} 