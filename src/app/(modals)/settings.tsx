import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Image } from 'react-native';
import ThemeToggle from '../../components/ThemeToggle';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';

export default function SettingsModal() {
  const { signOut, profile, refreshProfile } = useAuth();
  const [uploading, setUploading] = useState(false);

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
