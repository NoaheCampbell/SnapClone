import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import React, { useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'

export default function SignupScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const { signUp } = useAuth()

  const handleSignup = async () => {
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert('Error', 'Please fill in all fields')
      return
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match')
      return
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters')
      return
    }

    setLoading(true)
    const { error } = await signUp(email.trim(), password)

    if (error) {
      Alert.alert('Signup Failed', error.message)
    } else {
      // Skip email confirmation and go directly to profile creation
      Alert.alert(
        'Account Created!',
        'Your account has been created successfully. Please create your profile.',
        [
          {
            text: 'Continue',
            onPress: () => router.replace('./create-profile' as any)
          }
        ]
      )
    }
    setLoading(false)
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
            <View className="w-20 h-20 bg-yellow-400 rounded-full items-center justify-center mb-6">
              <Feather name="camera" size={32} color="black" />
            </View>
            <Text className="text-white text-3xl font-bold">Join SnapClone</Text>
            <Text className="text-gray-400 text-base mt-2">Create your account</Text>
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

            {/* Confirm Password Input */}
            <View>
              <Text className="text-white text-sm font-medium mb-2">Confirm Password</Text>
              <View className="bg-gray-800 rounded-xl px-4 py-4 flex-row items-center">
                <Feather name="lock" size={20} color="gray" />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm your password"
                  placeholderTextColor="gray"
                  className="flex-1 text-white text-base ml-3"
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Feather 
                    name={showConfirmPassword ? "eye-off" : "eye"} 
                    size={20} 
                    color="gray" 
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Signup Button */}
            <TouchableOpacity
              onPress={handleSignup}
              disabled={loading}
              className={`rounded-xl py-4 items-center mt-6 ${
                loading ? 'bg-gray-600' : 'bg-blue-500'
              }`}
            >
              <Text className="text-white text-base font-semibold">
                {loading ? 'Creating Account...' : 'Sign Up'}
              </Text>
            </TouchableOpacity>


          </View>

          {/* Footer */}
          <View className="items-center mt-8">
            <Text className="text-gray-400 text-base">
              Already have an account?
            </Text>
            <TouchableOpacity 
              onPress={() => router.back()}
              className="mt-2"
            >
              <Text className="text-blue-400 text-base font-semibold">
                Sign In
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
} 