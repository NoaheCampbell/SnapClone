import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Alert, 
  Switch,
  ScrollView,
  Modal,
  FlatList,
  Clipboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';

interface CircleDetails {
  id: string;
  name: string;
  visibility: 'public' | 'private';
  sprint_minutes: number;
  ttl_minutes: number;
  owner: string;
  allow_member_invites: boolean;
  members: Array<{
    user_id: string;
    username: string;
    role: string;
  }>;
}

interface Friend {
  user_id: string;
  username: string;
  avatar_url?: string;
  has_pending_invite?: boolean;
}

export default function CircleSettingsScreen() {
  const { circleId } = useLocalSearchParams<{ circleId: string }>();
  const [circle, setCircle] = useState<CircleDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Edit states
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  const [newSprintMinutes, setNewSprintMinutes] = useState(25);
  const [newTtlMinutes, setNewTtlMinutes] = useState(30);
  
  // Member management
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [availableFriends, setAvailableFriends] = useState<Friend[]>([]);
  const [selectedNewMembers, setSelectedNewMembers] = useState<string[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  
  const [muteNotifications, setMuteNotifications] = useState<boolean>(false);

  useEffect(() => {
    if (circleId) {
      loadCircleDetails();
      getCurrentUser();
    }
  }, [circleId]);

  useEffect(() => {
    if (!circle?.id || !currentUserId) return;
    supabase
      .from('circle_members')
      .select('mute_notifications')
      .eq('circle_id', circle.id)
      .eq('user_id', currentUserId)
      .single()
      .then(({ data }) => {
        if (data) setMuteNotifications(data.mute_notifications);
      });
  }, [circle?.id, currentUserId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const loadCircleDetails = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.rpc('get_circle_details', {
        p_circle_id: circleId
      });

      if (error) throw error;
      
      if (data?.error) {
        Alert.alert('Error', 'You do not have access to this circle');
        router.back();
        return;
      }

      setCircle(data);
      setNewName(data.name);
      setNewSprintMinutes(data.sprint_minutes);
      setNewTtlMinutes(data.ttl_minutes);

    } catch (error) {
      console.error('Error loading circle details:', error);
      Alert.alert('Error', 'Failed to load circle details');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableFriends = async () => {
    try {
      const { data: friends, error } = await supabase
        .from('friends')
        .select(`
          friend_id,
          profiles!friends_friend_id_fkey (
            user_id,
            username
          )
        `)
        .eq('user_id', currentUserId);

      if (error) throw error;

      const friendsList = friends?.map((f: any) => ({
        user_id: f.profiles.user_id,
        username: f.profiles.username
      })) || [];

      // Filter out friends who are already members
      const currentMemberIds = circle?.members.map(m => m.user_id) || [];
      const availableFriends = friendsList.filter(f => !currentMemberIds.includes(f.user_id));
      
      setAvailableFriends(availableFriends);
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const isOwner = currentUserId === circle?.owner;
  const canEdit = isOwner; // In the future, could allow admins too

  const updateCircleName = async () => {
    if (!canEdit || !newName.trim()) return;
    
    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('circles')
        .update({ name: newName.trim() })
        .eq('id', circleId);

      if (error) throw error;

      setCircle(prev => prev ? { ...prev, name: newName.trim() } : null);
      setEditingName(false);
      
      // Send system message about name change
      await supabase
        .from('messages')
        .insert({
          circle_id: circleId,
          sender_id: currentUserId,
          content: `Circle name changed to "${newName.trim()}"`
        });

    } catch (error) {
      console.error('Error updating circle name:', error);
      Alert.alert('Error', 'Failed to update circle name');
    } finally {
      setSaving(false);
    }
  };

  const updateCircleVisibility = async (visibility: 'public' | 'private') => {
    if (!canEdit) return;
    
    try {
      setSaving(true);
      
      const { data, error } = await supabase
        .from('circles')
        .update({ visibility })
        .eq('id', circleId)
        .select();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }
            
      setCircle(prev => prev ? { ...prev, visibility } : null);
      
      // Send system message about visibility change
      await supabase
        .from('messages')
        .insert({
          circle_id: circleId,
          sender_id: currentUserId,
          content: `Circle is now ${visibility}`
        });

      // Refresh circle details to ensure we have the latest data
      await loadCircleDetails();

      Alert.alert('Success', `Circle is now ${visibility}`);

    } catch (error) {
      console.error('Error updating circle visibility:', error);
      Alert.alert('Error', 'Failed to update circle visibility');
    } finally {
      setSaving(false);
    }
  };

  const updateSprintSettings = async () => {
    if (!canEdit) return;
    
    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('circles')
        .update({ 
          sprint_minutes: newSprintMinutes,
          ttl_minutes: newTtlMinutes 
        })
        .eq('id', circleId);

      if (error) throw error;

      setCircle(prev => prev ? { 
        ...prev, 
        sprint_minutes: newSprintMinutes,
        ttl_minutes: newTtlMinutes 
      } : null);
      
      // Send system message about settings change
      await supabase
        .from('messages')
        .insert({
          circle_id: circleId,
          sender_id: currentUserId,
          content: `Sprint settings updated: ${newSprintMinutes}min sprints, ${newTtlMinutes}min TTL`
        });

    } catch (error) {
      console.error('Error updating sprint settings:', error);
      Alert.alert('Error', 'Failed to update sprint settings');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (memberId: string, username: string) => {
    if (!canEdit || memberId === currentUserId) return;
    
    Alert.alert(
      'Remove Member',
      `Remove ${username} from this circle?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('circle_members')
                .delete()
                .eq('circle_id', circleId)
                .eq('user_id', memberId);

              if (error) throw error;

              // Update local state
              setCircle(prev => prev ? {
                ...prev,
                members: prev.members.filter(m => m.user_id !== memberId)
              } : null);

              // Send system message
              await supabase
                .from('messages')
                .insert({
                  circle_id: circleId,
                  sender_id: currentUserId,
                  content: `${username} was removed from the circle`
                });

            } catch (error) {
              console.error('Error removing member:', error);
              Alert.alert('Error', 'Failed to remove member');
            }
          }
        }
      ]
    );
  };

  const addMembers = async () => {
    if (selectedNewMembers.length === 0 || addingMembers) return;

    try {
      setAddingMembers(true);

      if (circle?.visibility === 'public') {
        // For public circles, directly add members
        const newMembers = selectedNewMembers.map(userId => ({
          circle_id: circleId,
          user_id: userId,
          role: 'member'
        }));

        const { error: membersError } = await supabase
          .from('circle_members')
          .insert(newMembers);

        if (membersError) throw membersError;

        // Get the usernames of added members
        const addedUsernames = availableFriends
          .filter(f => selectedNewMembers.includes(f.user_id))
          .map(f => f.username);

        // Update local state
        const newMemberObjects = selectedNewMembers.map(userId => {
          const friend = availableFriends.find(f => f.user_id === userId);
          return {
            user_id: userId,
            username: friend?.username || 'Unknown',
            role: 'member'
          };
        });

        setCircle(prev => prev ? {
          ...prev,
          members: [...prev.members, ...newMemberObjects]
        } : null);

        // Send system message
        await supabase
          .from('messages')
          .insert({
            circle_id: circleId,
            sender_id: currentUserId,
            content: `${addedUsernames.join(', ')} ${addedUsernames.length === 1 ? 'was' : 'were'} added to the circle`
          });

        Alert.alert('Success', `Added ${selectedNewMembers.length} member${selectedNewMembers.length !== 1 ? 's' : ''}`);
      } else {
        // For private circles, send invitations
        let successCount = 0;
        const failedUsers = [];

        for (const userId of selectedNewMembers) {
          const { data, error } = await supabase.rpc('send_circle_invitation', {
            p_circle_id: circleId,
            p_to_user_id: userId
          });

          if (error || data?.error) {
            const friend = availableFriends.find(f => f.user_id === userId);
            failedUsers.push(friend?.username || 'Unknown');
          } else {
            successCount++;
          }
        }

        if (successCount > 0) {
          Alert.alert('Success', `Sent ${successCount} invitation${successCount !== 1 ? 's' : ''}`);
        }
        
        if (failedUsers.length > 0) {
          Alert.alert('Some invitations failed', `Could not invite: ${failedUsers.join(', ')}`);
        }
      }

      // Reset state
      setSelectedNewMembers([]);
      setShowAddMembers(false);
      // Reload available friends to update invite status
      loadAvailableFriends();
      
    } catch (error) {
      console.error('Error adding members:', error);
      Alert.alert('Error', circle?.visibility === 'public' ? 'Failed to add members to the circle' : 'Failed to send invitations');
    } finally {
      setAddingMembers(false);
    }
  };

  const leaveCircle = async () => {
    Alert.alert(
      'Leave Circle',
      'Are you sure you want to leave this circle?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('circle_members')
                .delete()
                .eq('circle_id', circleId)
                .eq('user_id', currentUserId);

              if (error) throw error;

              router.back();
            } catch (error) {
              console.error('Error leaving circle:', error);
              Alert.alert('Error', 'Failed to leave circle');
            }
          }
        }
      ]
    );
  };

  const deleteCircle = async () => {
    if (!isOwner) return;
    
    Alert.alert(
      'Delete Circle',
      'Are you sure you want to delete this circle? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('circles')
                .delete()
                .eq('id', circleId);

              if (error) throw error;

              router.back();
            } catch (error) {
              console.error('Error deleting circle:', error);
              Alert.alert('Error', 'Failed to delete circle');
            }
          }
        }
      ]
    );
  };

  const toggleMute = async (value: boolean) => {
    setMuteNotifications(value);
    await supabase
      .from('circle_members')
      .update({ mute_notifications: value })
      .eq('circle_id', circle?.id)
      .eq('user_id', currentUserId);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-black">
        <View className="flex-1 justify-center items-center">
          <Text className="text-white">Loading circle settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!circle) {
    return (
      <SafeAreaView className="flex-1 bg-black">
        <View className="flex-1 justify-center items-center">
          <Text className="text-white">Circle not found</Text>
          <TouchableOpacity onPress={() => router.back()} className="mt-4">
            <Text className="text-blue-400">Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="flex-row items-center justify-between p-4 border-b border-gray-800">
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="x" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-lg font-semibold">Circle Settings</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Circle Name */}
        <View className="p-4 border-b border-gray-800">
          <Text className="text-white text-lg font-bold mb-3">Circle Name</Text>
          {editingName ? (
            <View className="flex-row items-center space-x-2">
              <TextInput
                value={newName}
                onChangeText={setNewName}
                className="flex-1 bg-gray-800 text-white p-3 rounded-lg"
                placeholder="Enter circle name"
                placeholderTextColor="#9CA3AF"
                autoFocus
              />
              <TouchableOpacity
                onPress={updateCircleName}
                disabled={saving || !newName.trim()}
                className="bg-blue-500 px-4 py-3 rounded-lg"
              >
                <Text className="text-white font-semibold">Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setEditingName(false);
                  setNewName(circle.name);
                }}
                className="bg-gray-600 px-4 py-3 rounded-lg"
              >
                <Text className="text-white">Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-row items-center justify-between">
              <Text className="text-white text-base">{circle.name}</Text>
              {canEdit && (
                <TouchableOpacity onPress={() => setEditingName(true)}>
                  <Feather name="edit-2" size={20} color="#60A5FA" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Visibility */}
        <View className="p-4 border-b border-gray-800">
          <Text className="text-white text-lg font-bold mb-3">Privacy</Text>
          <View className="flex-row items-center justify-between p-3 bg-gray-800 rounded-lg mb-2">
            <View className="flex-row items-center flex-1">
              <Feather name={circle.visibility === 'public' ? 'globe' : 'lock'} size={20} color="white" style={{ marginRight: 12 }} />
              <View className="flex-1">
                <Text className="text-white font-medium">
                  {circle.visibility === 'public' ? 'Public Circle' : 'Private Circle'}
                </Text>
                <Text className="text-gray-400 text-sm">
                  {circle.visibility === 'public' 
                    ? 'Anyone can discover and join this circle'
                    : 'Only invited members can join this circle'
                  }
                </Text>
              </View>
            </View>
            {canEdit && (
              <Switch
                key={`visibility-${circle.visibility}`}
                value={circle.visibility === 'public'}
                onValueChange={(value) => updateCircleVisibility(value ? 'public' : 'private')}
                trackColor={{ false: '#767577', true: '#81b0ff' }}
                thumbColor={circle.visibility === 'public' ? '#f5dd4b' : '#f4f3f4'}
              />
            )}
          </View>
        </View>

        {/* Notification Preferences */}
        <View className="p-4 border-b border-gray-800">
          <Text className="text-white text-lg font-bold mb-3">Notifications</Text>
          <View className="flex-row items-center justify-between p-3 bg-gray-800 rounded-lg">
            <View className="flex-row items-center flex-1">
              <Feather name="bell" size={20} color="white" style={{ marginRight: 12 }} />
              <View className="flex-1">
                <Text className="text-white font-medium">Message Notifications</Text>
                <Text className="text-gray-400 text-sm">{muteNotifications ? 'Muted' : 'Enabled'}</Text>
              </View>
            </View>
            <Switch
              value={!muteNotifications}
              onValueChange={(val)=>toggleMute(!val ? true:false)}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={!muteNotifications ? '#f5dd4b' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Sprint Settings */}
        {canEdit && (
          <View className="p-4 border-b border-gray-800">
            <Text className="text-white text-lg font-bold mb-3">Sprint Settings</Text>
            
            <View className="space-y-4">
              <View>
                <Text className="text-white font-medium mb-2">Sprint Duration (minutes)</Text>
                <TextInput
                  value={newSprintMinutes.toString()}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 25;
                    setNewSprintMinutes(num);
                  }}
                  className="bg-gray-800 text-white p-3 rounded-lg"
                  keyboardType="numeric"
                  placeholder="25"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <View>
                <Text className="text-white font-medium mb-2">Media TTL (minutes)</Text>
                <TextInput
                  value={newTtlMinutes.toString()}
                  onChangeText={(text) => {
                    const num = parseInt(text) || 30;
                    setNewTtlMinutes(num);
                  }}
                  className="bg-gray-800 text-white p-3 rounded-lg"
                  keyboardType="numeric"
                  placeholder="30"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              
              <TouchableOpacity
                onPress={updateSprintSettings}
                disabled={saving}
                className="bg-blue-500 py-3 rounded-lg items-center"
              >
                <Text className="text-white font-semibold">
                  {saving ? 'Updating...' : 'Update Sprint Settings'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Members */}
        <View className="p-4 border-b border-gray-800">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-white text-lg font-bold">Members ({circle.members.length})</Text>
            {canEdit && (
              <TouchableOpacity
                onPress={() => {
                  loadAvailableFriends();
                  setShowAddMembers(true);
                }}
                className="flex-row items-center"
              >
                <Feather name="user-plus" size={20} color="#60A5FA" />
                <Text className="text-blue-400 ml-1">
                  {circle.visibility === 'public' ? 'Add' : 'Invite'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          
          {circle.members.map((member) => (
            <View key={member.user_id} className="flex-row items-center justify-between p-3 bg-gray-800 rounded-lg mb-2">
              <View className="flex-row items-center flex-1">
                <View className="w-10 h-10 rounded-full bg-gray-600 items-center justify-center mr-3">
                  <Feather name="user" size={16} color="white" />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-medium">{member.username}</Text>
                  <Text className="text-gray-400 text-sm capitalize">{member.role}</Text>
                </View>
              </View>
              
              {canEdit && member.user_id !== currentUserId && (
                <TouchableOpacity
                  onPress={() => removeMember(member.user_id, member.username)}
                  className="p-2"
                >
                  <Feather name="user-minus" size={16} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Danger Zone */}
        <View className="p-4">
          <Text className="text-red-400 text-lg font-bold mb-3">Danger Zone</Text>
          
          {!isOwner && (
            <TouchableOpacity
              onPress={leaveCircle}
              className="bg-red-500 py-3 rounded-lg items-center mb-3"
            >
              <Text className="text-white font-semibold">Leave Circle</Text>
            </TouchableOpacity>
          )}
          
          {isOwner && (
            <TouchableOpacity
              onPress={deleteCircle}
              className="bg-red-600 py-3 rounded-lg items-center"
            >
              <Text className="text-white font-semibold">Delete Circle</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Add Members Modal */}
      <Modal
        visible={showAddMembers}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView className="flex-1 bg-black">
          <View className="flex-row items-center justify-between p-4 border-b border-gray-800">
            <TouchableOpacity onPress={() => setShowAddMembers(false)}>
              <Text className="text-blue-400 text-lg">Cancel</Text>
            </TouchableOpacity>
            <Text className="text-white text-lg font-semibold">
              {circle?.visibility === 'public' ? 'Add Members' : 'Invite Friends'}
            </Text>
            <TouchableOpacity
              onPress={addMembers}
              disabled={selectedNewMembers.length === 0 || addingMembers}
            >
              <Text className={`text-lg font-semibold ${
                selectedNewMembers.length > 0 && !addingMembers ? 'text-blue-400' : 'text-gray-500'
              }`}>
                {addingMembers ? 'Processing...' : (circle?.visibility === 'public' ? 'Add' : 'Invite')}
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={availableFriends}
            keyExtractor={(item) => item.user_id}
            renderItem={({ item }) => {
              const isSelected = selectedNewMembers.includes(item.user_id);
              return (
                <TouchableOpacity
                  onPress={() => {
                    if (isSelected) {
                      setSelectedNewMembers(prev => prev.filter(id => id !== item.user_id));
                    } else {
                      setSelectedNewMembers(prev => [...prev, item.user_id]);
                    }
                  }}
                  className="flex-row items-center p-4 border-b border-gray-800"
                >
                  <View className="w-12 h-12 rounded-full bg-gray-600 items-center justify-center mr-3">
                    <Feather name="user" size={20} color="white" />
                  </View>
                  
                  <View className="flex-1">
                    <Text className="text-white font-semibold text-base">{item.username}</Text>
                  </View>
                  
                  <View className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                    isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-400'
                  }`}>
                    {isSelected && (
                      <Feather name="check" size={14} color="white" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View className="flex-1 justify-center items-center p-8">
                <Feather name="users" size={64} color="gray" />
                <Text className="text-gray-400 text-lg mt-4 text-center">
                  No friends available to add
                </Text>
                <Text className="text-gray-500 text-sm mt-2 text-center">
                  All your friends are already in this circle
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
} 