import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Friend {
  user_id: string;
  username: string;
  avatar_url?: string;
}

export default function AddMembersPage() {
  const router = useRouter();
  const { circleId } = useLocalSearchParams<{ circleId: string }>();
  const { user } = useAuth();
  
  const [availableFriends, setAvailableFriends] = useState<Friend[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadAvailableFriends();
  }, []);

  const loadAvailableFriends = async () => {
    try {
      if (!user) return;

      // Get current circle members
      const { data: members } = await supabase
        .from('circle_members')
        .select('user_id')
        .eq('circle_id', circleId);

      const memberIds = members?.map(m => m.user_id) || [];

      // Get user's friends who aren't already in the circle
      const { data: friends } = await supabase
        .from('friends')
        .select(`
          friend_id,
          profiles!friends_friend_id_fkey (
            user_id,
            username,
            avatar_url
          )
        `)
        .eq('user_id', user.id)
        .not('friend_id', 'in', `(${memberIds.join(',')})`);

      const availableFriendsList = friends?.map((f: any) => ({
        user_id: f.profiles.user_id,
        username: f.profiles.username,
        avatar_url: f.profiles.avatar_url
      })) || [];

      setAvailableFriends(availableFriendsList);
    } catch (error) {
      console.error('Error loading available friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const addMembersToCircle = async () => {
    if (selectedMembers.length === 0) return;
    
    setAdding(true);
    try {
      const newMembers = selectedMembers.map(userId => ({
        circle_id: circleId,
        user_id: userId,
        role: 'member' as const
      }));

      const { error } = await supabase
        .from('circle_members')
        .insert(newMembers);

      if (error) throw error;

      Alert.alert(
        'Success',
        `Added ${selectedMembers.length} member${selectedMembers.length !== 1 ? 's' : ''}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Error adding members:', error);
      Alert.alert('Error', 'Failed to add members');
    } finally {
      setAdding(false);
    }
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const renderFriend = ({ item }: { item: Friend }) => (
    <TouchableOpacity
      onPress={() => toggleMember(item.user_id)}
      className="flex-row items-center p-4 border-b border-gray-800"
    >
      <Image
        source={item.avatar_url ? { uri: item.avatar_url } : require('../../../assets/images/avatar-placeholder.png')}
        className="w-10 h-10 rounded-full mr-3"
      />
      <Text className="text-white flex-1">{item.username}</Text>
      <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
        selectedMembers.includes(item.user_id) ? 'bg-blue-500 border-blue-500' : 'border-gray-400'
      }`}>
        {selectedMembers.includes(item.user_id) && (
          <Feather name="check" size={12} color="white" />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-gray-800">
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold">Add Members</Text>
        <TouchableOpacity
          onPress={addMembersToCircle}
          disabled={selectedMembers.length === 0 || adding}
          className={selectedMembers.length > 0 && !adding ? '' : 'opacity-50'}
        >
          <Text className={`text-lg font-semibold ${
            selectedMembers.length > 0 && !adding ? 'text-blue-500' : 'text-gray-500'
          }`}>
            {adding ? 'Adding...' : 'Add'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="white" />
        </View>
      ) : (
        <FlatList
          data={availableFriends}
          keyExtractor={(item) => item.user_id}
          renderItem={renderFriend}
          ListEmptyComponent={() => (
            <View className="p-8 items-center">
              <Feather name="users" size={48} color="gray" />
              <Text className="text-gray-400 text-center mt-4">
                No friends available to add
              </Text>
              <Text className="text-gray-500 text-sm text-center mt-2">
                All your friends are already in this circle
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
} 