import { useEffect } from 'react'
import { View, Text } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '../contexts/AuthContext'

export default function IndexScreen() {
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    console.log('Auth state:', { user: !!user, profile: !!profile, loading })
    
    if (!loading) {
      if (!user) {
        console.log('No user, redirecting to login')
        router.replace('/(auth)/login')
      } else if (user && !profile) {
        console.log('User exists but no profile, redirecting to profile creation')
        router.replace('/(auth)/create-profile')
      } else if (user && profile) {
        console.log('User and profile exist, redirecting to main app')
        router.replace('/(tabs)')
      }
    }
  }, [user, profile, loading])

  // Add timeout fallback in case loading gets stuck - but only if no user at all
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading && !user) {
        console.log('Loading timeout with no user, forcing redirect to login')
        router.replace('/(auth)/login')
      } else if (loading && user) {
        console.log('Loading timeout but user exists, continuing to wait for profile...')
      }
    }, 10000) // Increased to 10 seconds and only redirect if no user

    return () => clearTimeout(timeout)
  }, [loading, user])

  // Show loading screen while checking auth state
  return (
    <View className="flex-1 bg-black items-center justify-center">
      <Text className="text-white text-lg">Loading...</Text>
      <Text className="text-gray-400 text-sm mt-2">
        User: {user ? 'Yes' : 'No'} | Profile: {profile ? 'Yes' : 'No'} | Loading: {loading ? 'Yes' : 'No'}
      </Text>
    </View>
  )
} 