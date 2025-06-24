import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import React, { useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'

export default function CreateProfileScreen() {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  
  const { createProfile } = useAuth()

  const handleCreateProfile = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Username is required')
      return
    }

    if (username.length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters')
      return
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      Alert.alert('Error', 'Username can only contain letters, numbers, and underscores')
      return
    }

    setLoading(true)
    
    try {
      console.log('handleCreateProfile: Starting...');
      const { error } = await createProfile(username.trim(), displayName.trim() || undefined);

      if (error) {
        // The error from createProfile is now guaranteed to be an Error object or a Supabase error
        console.error('handleCreateProfile: Failed!', error);
        
        // Check for Supabase unique constraint violation
        if (error.message.includes('duplicate key value violates unique constraint')) {
          Alert.alert('Username Taken', 'This username is already taken. Please choose another one.');
        } else {
          Alert.alert('Error Creating Profile', error.message || 'An unknown error occurred.');
        }
      } else {
        console.log('handleCreateProfile: Success! Navigating...');
        // Small delay to ensure profile state updates
        setTimeout(() => {
          router.replace('/');
        }, 500);
      }
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error('An unexpected error occurred.');
      console.error('handleCreateProfile: Caught exception!', err);
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView 
        className="flex-1" 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-1 px-6 justify-center">
          {/* Header */}
          <View className="items-center mb-12">
            <View className="w-20 h-20 bg-yellow-400 rounded-full items-center justify-center mb-6">
              <Feather name="user" size={32} color="black" />
            </View>
            <Text className="text-white text-3xl font-bold">Create Profile</Text>
            <Text className="text-gray-400 text-base mt-2 text-center">
              Set up your profile to get started
            </Text>
          </View>

          {/* Form */}
          <View className="space-y-4">
            {/* Username Input */}
            <View>
              <Text className="text-white text-sm font-medium mb-2">
                Username <Text className="text-red-400">*</Text>
              </Text>
              <View className="bg-gray-800 rounded-xl px-4 py-4 flex-row items-center">
                <Text className="text-gray-400 text-base">@</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="username"
                  placeholderTextColor="gray"
                  className="flex-1 text-white text-base ml-2"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                />
              </View>
              <Text className="text-gray-500 text-xs mt-1">
                Letters, numbers, and underscores only
              </Text>
            </View>

            {/* Display Name Input */}
            <View>
              <Text className="text-white text-sm font-medium mb-2">Display Name</Text>
              <View className="bg-gray-800 rounded-xl px-4 py-4 flex-row items-center">
                <Feather name="user" size={20} color="gray" />
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your display name (optional)"
                  placeholderTextColor="gray"
                  className="flex-1 text-white text-base ml-3"
                  maxLength={50}
                />
              </View>
              <Text className="text-gray-500 text-xs mt-1">
                How others will see your name
              </Text>
            </View>

            {/* Create Profile Button */}
            <TouchableOpacity
              onPress={handleCreateProfile}
              disabled={loading || !username.trim()}
              className={`rounded-xl py-4 items-center mt-8 ${
                loading || !username.trim() ? 'bg-gray-600' : 'bg-blue-500'
              }`}
            >
              <Text className="text-white text-base font-semibold">
                {loading ? 'Creating Profile...' : 'Create Profile'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Info */}
          <View className="mt-8 p-4 bg-gray-800 rounded-xl">
            <View className="flex-row items-center mb-2">
              <Feather name="info" size={16} color="blue" />
              <Text className="text-blue-400 text-sm font-medium ml-2">Profile Info</Text>
            </View>
            <Text className="text-gray-400 text-sm">
              Your username is unique and cannot be changed later. Choose wisely!
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
} 