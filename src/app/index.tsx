import { useEffect } from 'react'
import { View, Text } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '../contexts/AuthContext'

export default function IndexScreen() {
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/(auth)/login')
      } else if (user && !profile) {
        router.replace('/(auth)/create-profile')
      } else if (user && profile) {
        router.replace('/(tabs)')
      }
    }
  }, [user, profile, loading])

  // Add timeout fallback in case loading gets stuck - but only if no user at all
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading && !user) {
        router.replace('/(auth)/login')
      }
    }, 10000) // Increased to 10 seconds and only redirect if no user

    return () => clearTimeout(timeout)
  }, [loading, user])

  // Show loading screen while checking auth state
  return (
    <View className="flex-1 bg-black items-center justify-center">
      <Text className="text-white text-lg">Loading...</Text>
    </View>
  )
} 