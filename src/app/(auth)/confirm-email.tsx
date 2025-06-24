import { View, Text, TouchableOpacity, Alert } from 'react-native'
import React, { useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '../../contexts/AuthContext'

export default function ConfirmEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>()
  const [loading, setLoading] = useState(false)
  const [checkingConfirmation, setCheckingConfirmation] = useState(false)
  const { resendConfirmation, signIn } = useAuth()

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

  const checkEmailConfirmation = async () => {
    if (!email) return

    Alert.alert(
      'Check Email Confirmation',
      'Have you clicked the confirmation link in your email?',
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: 'Yes, I Confirmed',
          onPress: async () => {
            setCheckingConfirmation(true)
            // Try to sign in to check if email is confirmed
            const { error } = await signIn(email, 'temp_password_for_check')
            
            if (error && error.message?.includes('Email not confirmed')) {
              Alert.alert(
                'Email Not Confirmed',
                'Please click the confirmation link in your email first, then try again.'
              )
            } else if (error && error.message?.includes('Invalid login credentials')) {
              // This means email is confirmed but password is wrong, which is expected
              Alert.alert(
                'Email Confirmed! ✅',
                'Your email has been confirmed. You can now sign in with your password.',
                [
                  {
                    text: 'Go to Sign In',
                    onPress: () => router.replace('/(auth)/login')
                  }
                ]
              )
            } else if (!error) {
              // Shouldn't happen with temp password, but just in case
              router.replace('/')
            } else {
              Alert.alert('Error', 'Unable to check confirmation status. Please try signing in manually.')
            }
            setCheckingConfirmation(false)
          }
        }
      ]
    )
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
            2. Click the "Confirm your email" link
          </Text>
          <Text className="text-gray-300 text-sm mb-2">
            3. You'll see a "Email confirmed" success page
          </Text>
          <Text className="text-gray-300 text-sm">
            4. Return here and click "I Confirmed My Email"
          </Text>
        </View>

        {/* Development Note */}
        <View className="bg-blue-900 border border-blue-500 rounded-xl p-4 mb-6">
          <View className="flex-row items-center mb-2">
            <Feather name="info" size={16} color="#3b82f6" />
            <Text className="text-blue-400 text-sm font-medium ml-2">Development Mode</Text>
          </View>
          <Text className="text-blue-300 text-sm">
            The confirmation link will open in your browser and show a success page. This is normal for development.
          </Text>
        </View>

        {/* Actions */}
        <View className="space-y-4">
          <TouchableOpacity
            onPress={checkEmailConfirmation}
            disabled={checkingConfirmation}
            className={`rounded-xl py-4 items-center ${
              checkingConfirmation ? 'bg-gray-600' : 'bg-green-500'
            }`}
          >
            <Text className="text-white text-base font-semibold">
              {checkingConfirmation ? 'Checking...' : 'I Confirmed My Email'}
            </Text>
          </TouchableOpacity>

          {/* Development bypass option */}
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                'Development Bypass',
                'Skip email confirmation for development? This should only be used during testing.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Skip for Now',
                    onPress: () => {
                      Alert.alert(
                        'Confirmation Skipped',
                        'You can now try signing in. Note: In production, email confirmation would be required.',
                        [
                          {
                            text: 'Go to Sign In',
                            onPress: () => router.replace('/(auth)/login')
                          }
                        ]
                      )
                    }
                  }
                ]
              )
            }}
            className="rounded-xl py-4 items-center bg-yellow-600"
          >
            <Text className="text-white text-base font-semibold">
              Skip Email Confirmation (Dev Only)
            </Text>
          </TouchableOpacity>

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
            The confirmation link will expire in 24 hours. If you're having trouble, try checking your spam folder.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  )
} 