import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import ThemeToggle from '../../components/ThemeToggle';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';

export default function SettingsModal() {
  const { signOut, profile } = useAuth();

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
              <View className="w-12 h-12 bg-gray-600 rounded-full items-center justify-center mr-3">
                <Feather name="user" size={20} color="white" />
              </View>
              <View>
                <Text className="text-white font-semibold">{profile.display_name || profile.username}</Text>
                <Text className="text-gray-400">@{profile.username}</Text>
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
