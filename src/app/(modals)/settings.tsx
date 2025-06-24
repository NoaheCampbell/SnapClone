import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, Image, Switch, StyleSheet } from 'react-native';
import ThemeToggle from '../../components/ThemeToggle';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import { useColorScheme } from '../../../components/useColorScheme';
import Colors from '../../../constants/Colors';

export default function SettingsModal() {
  const { signOut, profile, refreshProfile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [privacySettings, setPrivacySettings] = useState({
    is_private: false,
    allow_friend_requests: true,
    show_last_active: true,
    show_stories_to_friends_only: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getCurrentTheme = async () => {
      const colorScheme = useColorScheme();
      setIsEnabled(colorScheme === 'dark');
    };
    getCurrentTheme();
    loadPrivacySettings();
  }, []);

  const loadPrivacySettings = async () => {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_private, allow_friend_requests, show_last_active, show_stories_to_friends_only')
        .eq('user_id', profile.user_id)
        .single();
      
      if (error) throw error;
      if (data) {
        setPrivacySettings(data);
      }
    } catch (error) {
      console.error('Error loading privacy settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePrivacySetting = async (key: keyof typeof privacySettings, value: boolean) => {
    if (!profile) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [key]: value })
        .eq('user_id', profile.user_id);
      
      if (error) throw error;
      setPrivacySettings(prev => ({ ...prev, [key]: value }));
    } catch (error) {
      console.error('Error updating privacy setting:', error);
    }
  };

  const pickAvatar = async () => {
    try {
      // Ask for permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Need photo library permission to set avatar');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1], // Square aspect ratio
        quality: 0.8,
      });

      if (result.canceled) return;

      setUploading(true);
      await uploadAvatar(result.assets[0]);
    } catch (err) {
      console.error('Error picking avatar:', err);
      Alert.alert('Error', 'Could not pick avatar');
    } finally {
      setUploading(false);
    }
  };

  const uploadAvatar = async (asset: any) => {
    try {
      if (!profile?.user_id) return;

      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `avatars/${profile.user_id}.${ext}`;

      // Read file as base64 and convert to ArrayBuffer
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const arrayBuffer = decode(base64);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(path, arrayBuffer, {
          contentType: `image/${ext}`,
          upsert: true, // Replace existing avatar
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = await supabase.storage
        .from('chat-media')
        .getPublicUrl(path);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl })
        .eq('user_id', profile.user_id);

      if (updateError) throw updateError;

      // Refresh the profile in context
      await refreshProfile();
      
      Alert.alert('Success', 'Avatar updated successfully!');
    } catch (err) {
      console.error('Error uploading avatar:', err);
      Alert.alert('Error', 'Could not upload avatar');
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-row justify-between items-center p-4 border-b border-gray-800">
        <Text className="text-2xl font-bold text-white">Settings</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={24} color="white" />
        </TouchableOpacity>
      </View>
      
      <View className="flex-1">
        {/* Profile Section */}
        {profile && (
          <View className="p-4 border-b border-gray-800">
            <Text className="text-gray-400 text-sm mb-2">Profile</Text>
            <View className="flex-row items-center">
              <TouchableOpacity 
                onPress={pickAvatar}
                disabled={uploading}
                className="relative mr-3"
              >
                {profile.avatar_url ? (
                  <Image 
                    source={{ uri: profile.avatar_url }} 
                    className="w-16 h-16 rounded-full"
                    style={{ opacity: uploading ? 0.5 : 1 }}
                  />
                ) : (
                  <View className="w-16 h-16 bg-gray-600 rounded-full items-center justify-center">
                    <Feather name="user" size={24} color="white" />
                  </View>
                )}
                <View className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-500 rounded-full items-center justify-center border-2 border-black">
                  <Feather name={uploading ? "loader" : "camera"} size={12} color="white" />
                </View>
              </TouchableOpacity>
              <View className="flex-1">
                <Text className="text-white font-semibold text-lg">{profile.display_name || profile.username}</Text>
                <Text className="text-gray-400 text-base">@{profile.username}</Text>
                <TouchableOpacity onPress={pickAvatar} disabled={uploading}>
                  <Text className="text-blue-400 text-sm mt-1">
                    {uploading ? 'Uploading...' : 'Change Avatar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Theme Toggle */}
        <View className="p-4 border-b border-gray-800">
          <ThemeToggle />
        </View>

        {/* Privacy Settings */}
        <View className="p-4 border-b border-gray-800">
          <Text className="text-white text-lg font-bold mb-4">Privacy Settings</Text>
          
          <View className="space-y-4">
            <View className="flex-row items-center justify-between p-4 bg-gray-800 rounded-lg">
              <View className="flex-row items-center flex-1">
                <Feather name="lock" size={20} color="white" style={{ marginRight: 12 }} />
                <View className="flex-1">
                  <Text className="text-white font-medium">Private Account</Text>
                  <Text className="text-gray-400 text-sm">Only approved followers can see your content</Text>
                </View>
              </View>
              <Switch
                value={privacySettings.is_private}
                onValueChange={(value) => updatePrivacySetting('is_private', value)}
                trackColor={{ false: '#767577', true: '#81b0ff' }}
                thumbColor={privacySettings.is_private ? '#f5dd4b' : '#f4f3f4'}
              />
            </View>

            <View className="flex-row items-center justify-between p-4 bg-gray-800 rounded-lg">
              <View className="flex-row items-center flex-1">
                <Feather name="user-plus" size={20} color="white" style={{ marginRight: 12 }} />
                <View className="flex-1">
                  <Text className="text-white font-medium">Allow Friend Requests</Text>
                  <Text className="text-gray-400 text-sm">Let others send you friend requests</Text>
                </View>
              </View>
              <Switch
                value={privacySettings.allow_friend_requests}
                onValueChange={(value) => updatePrivacySetting('allow_friend_requests', value)}
                trackColor={{ false: '#767577', true: '#81b0ff' }}
                thumbColor={privacySettings.allow_friend_requests ? '#f5dd4b' : '#f4f3f4'}
              />
            </View>

            <View className="flex-row items-center justify-between p-4 bg-gray-800 rounded-lg">
              <View className="flex-row items-center flex-1">
                <Feather name="clock" size={20} color="white" style={{ marginRight: 12 }} />
                <View className="flex-1">
                  <Text className="text-white font-medium">Show Last Active</Text>
                  <Text className="text-gray-400 text-sm">Let friends see when you were last active</Text>
                </View>
              </View>
              <Switch
                value={privacySettings.show_last_active}
                onValueChange={(value) => updatePrivacySetting('show_last_active', value)}
                trackColor={{ false: '#767577', true: '#81b0ff' }}
                thumbColor={privacySettings.show_last_active ? '#f5dd4b' : '#f4f3f4'}
              />
            </View>

            <View className="flex-row items-center justify-between p-4 bg-gray-800 rounded-lg">
              <View className="flex-row items-center flex-1">
                <Feather name="eye" size={20} color="white" style={{ marginRight: 12 }} />
                <View className="flex-1">
                  <Text className="text-white font-medium">Stories Privacy</Text>
                  <Text className="text-gray-400 text-sm">Only show stories to friends</Text>
                </View>
              </View>
              <Switch
                value={privacySettings.show_stories_to_friends_only}
                onValueChange={(value) => updatePrivacySetting('show_stories_to_friends_only', value)}
                trackColor={{ false: '#767577', true: '#81b0ff' }}
                thumbColor={privacySettings.show_stories_to_friends_only ? '#f5dd4b' : '#f4f3f4'}
              />
            </View>
          </View>

          <Text className="text-white text-lg font-bold mb-4 mt-8">Account</Text>
        </View>

        {/* Sign Out */}
        <View className="p-4">
          <TouchableOpacity 
            onPress={handleSignOut}
            className="flex-row items-center py-3"
          >
            <Feather name="log-out" size={20} color="red" />
            <Text className="text-red-500 text-base font-medium ml-3">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
