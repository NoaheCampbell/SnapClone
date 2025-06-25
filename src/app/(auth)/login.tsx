import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Image } from 'react-native'
import React, { useState, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../../lib/supabase'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  const { signIn, signOut, user } = useAuth()

  // If user is already signed in but on login screen, they might be stuck
  useEffect(() => {
    if (user) {
      console.log('User already signed in, might need to sign out or create profile')
    }
  }, [user])



  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields')
      return
    }

    setLoading(true)
    
    try {
      const { error } = await signIn(email.trim(), password)

      if (error) {
        Alert.alert('Login Failed', error.message || 'Unknown error occurred')
      } else {
        // Small delay to ensure auth state updates
        setTimeout(() => {
          router.replace('/')
        }, 500)
      }
    } catch (error) {
      console.error('Login error:', error)
      Alert.alert('Login Failed', 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView 
        className="flex-1" 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-1 px-6 justify-center">
          {/* Header */}
          <View className="items-center mb-12">
            <Image 
              source={require('../../../assets/images/sprintloop.png')}
              className="w-24 h-24 mb-6"
              resizeMode="contain"
            />
            <Text className="text-white text-3xl font-bold">SprintLoop</Text>
            <Text className="text-gray-400 text-base mt-2">Sign in to continue</Text>
          </View>

          {/* Form */}
          <View className="space-y-4">
            {/* Email Input */}
            <View>
              <Text className="text-white text-sm font-medium mb-2">Email</Text>
              <View className="bg-gray-800 rounded-xl px-4 py-4 flex-row items-center">
                <Feather name="mail" size={20} color="gray" />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  placeholderTextColor="gray"
                  className="flex-1 text-white text-base ml-3"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password Input */}
            <View>
              <Text className="text-white text-sm font-medium mb-2">Password</Text>
              <View className="bg-gray-800 rounded-xl px-4 py-4 flex-row items-center">
                <Feather name="lock" size={20} color="gray" />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor="gray"
                  className="flex-1 text-white text-base ml-3"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Feather 
                    name={showPassword ? "eye-off" : "eye"} 
                    size={20} 
                    color="gray" 
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              className={`rounded-xl py-4 items-center mt-6 ${
                loading ? 'bg-gray-600' : 'bg-blue-500'
              }`}
            >
              <Text className="text-white text-base font-semibold">
                {loading ? 'Signing In...' : 'Sign In'}
              </Text>
            </TouchableOpacity>


          </View>



          {/* Footer */}
          <View className="items-center mt-8">
            <Text className="text-gray-400 text-base">
              Don't have an account?
            </Text>
            <TouchableOpacity 
              onPress={() => router.push('./signup' as any)}
              className="mt-2"
            >
              <Text className="text-blue-400 text-base font-semibold">
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
} 