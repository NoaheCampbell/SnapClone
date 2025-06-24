import { View, Text, TouchableOpacity, Alert } from 'react-native'
import React, { useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'

export default function ConfirmEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>()
  const [loading, setLoading] = useState(false)
  const { resendConfirmation } = useAuth()

  const handleResend = async () => {
    if (!email) return

    setLoading(true)
    const { error } = await resendConfirmation(email)

    if (error) {
      Alert.alert('Error', error.message || 'Failed to resend confirmation email')
    } else {
      Alert.alert('Email Sent!', 'Please check your email for the confirmation link.')
    }
    setLoading(false)
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 px-6 justify-center">
        {/* Header */}
        <View className="items-center mb-12">
          <View className="w-20 h-20 bg-green-500 rounded-full items-center justify-center mb-6">
            <Feather name="mail" size={32} color="white" />
          </View>
          <Text className="text-white text-3xl font-bold">Check Your Email</Text>
          <Text className="text-gray-400 text-base mt-2 text-center">
            We sent a confirmation link to
          </Text>
          <Text className="text-white text-base font-semibold mt-1">
            {email}
          </Text>
        </View>

        {/* Instructions */}
        <View className="bg-gray-800 rounded-xl p-6 mb-8">
          <Text className="text-white text-base mb-4">
            To complete your account setup:
          </Text>
          <Text className="text-gray-300 text-sm mb-2">
            1. Check your email inbox (and spam folder)
          </Text>
          <Text className="text-gray-300 text-sm mb-2">
            2. Click the confirmation link
          </Text>
          <Text className="text-gray-300 text-sm">
            3. Return to the app to continue
          </Text>
        </View>

        {/* Actions */}
        <View className="space-y-4">
          <TouchableOpacity
            onPress={handleResend}
            disabled={loading}
            className={`rounded-xl py-4 items-center ${
              loading ? 'bg-gray-600' : 'bg-blue-500'
            }`}
          >
            <Text className="text-white text-base font-semibold">
              {loading ? 'Sending...' : 'Resend Email'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            className="rounded-xl py-4 items-center border border-gray-600"
          >
            <Text className="text-white text-base font-semibold">
              Back to Sign In
            </Text>
          </TouchableOpacity>
        </View>

        {/* Help */}
        <View className="mt-8 items-center">
          <Text className="text-gray-500 text-sm text-center">
            Still having trouble? The confirmation link will expire in 24 hours.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  )
} 