import { useEffect, useState, useRef } from 'react'
import { View, Text, AppState, AppStateStatus } from 'react-native'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../contexts/AuthContext'
import VideoSplashScreen from '../components/VideoSplashScreen'

// Configuration
const VIDEO_SPLASH_CONFIG = {
  // Show video on first launch
  showOnFirstLaunch: true,
  
  // Show video when app becomes active after being backgrounded for this long (in minutes)
  backgroundThresholdMinutes: 0.1, // Very short threshold - 6 seconds
  
  // Show video when app is force closed and reopened
  showOnAppReactivation: true,
  
  // Show video on every app start (ignores other conditions)
  showOnEveryStart: true,
}

export default function IndexScreen() {
  const { user, profile, loading } = useAuth()
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null)
  const [showVideoSplash, setShowVideoSplash] = useState(false)
  
  const appState = useRef(AppState.currentState)
  const backgroundTime = useRef<number | null>(null)

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appState.current === 'background' && nextAppState === 'active') {
        handleAppReactivation()
      } else if (nextAppState === 'background') {
        backgroundTime.current = Date.now()
      }
      
      appState.current = nextAppState
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange)
    return () => subscription?.remove()
  }, [])

  // Save close time when app goes to background
  useEffect(() => {
    const saveCloseTime = () => {
      const now = Date.now().toString()
      AsyncStorage.setItem('lastAppCloseTime', now)
    }

    // Save immediately on mount
    saveCloseTime()
    
    // Also save when app goes to background
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        saveCloseTime()
      }
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange)
    return () => subscription?.remove()
  }, [])

  // Check if this is the first launch or should show splash
  useEffect(() => {
    const checkLaunchConditions = async () => {
      try {
        // Check first launch
        const hasSeenIntroVideo = await AsyncStorage.getItem('hasSeenIntroVideo')
        const isFirst = hasSeenIntroVideo === null
        
        // Check if we should show on every start
        if (VIDEO_SPLASH_CONFIG.showOnEveryStart) {
          setIsFirstLaunch(isFirst)
          setShowVideoSplash(true)
          return
        }
        
        // Check last app close time
        const lastCloseTime = await AsyncStorage.getItem('lastAppCloseTime')
        const shouldShowOnReactivation = await checkShouldShowOnReactivation(lastCloseTime)
        
        // Apply configuration logic
        const shouldShowForFirstLaunch = VIDEO_SPLASH_CONFIG.showOnFirstLaunch && isFirst
        const shouldShowForReactivation = VIDEO_SPLASH_CONFIG.showOnAppReactivation && shouldShowOnReactivation
        
        const shouldShowVideo = shouldShowForFirstLaunch || shouldShowForReactivation
        
        setIsFirstLaunch(isFirst)
        setShowVideoSplash(shouldShowVideo)
      } catch (error) {
        setIsFirstLaunch(false)
        setShowVideoSplash(false)
      }
    }

    checkLaunchConditions()
  }, [])

  // Check if we should show video on app reactivation
  const checkShouldShowOnReactivation = async (lastCloseTimeStr: string | null): Promise<boolean> => {
    if (!lastCloseTimeStr) {
      return true // Fresh app start after being terminated
    }
    
    const lastCloseTime = parseInt(lastCloseTimeStr)
    const now = Date.now()
    const timeDiffMinutes = (now - lastCloseTime) / (1000 * 60)
    
    // Show splash if app was closed for longer than threshold
    return timeDiffMinutes >= VIDEO_SPLASH_CONFIG.backgroundThresholdMinutes
  }

  // Handle app reactivation (coming from background or fresh start)
  const handleAppReactivation = async () => {
    if (backgroundTime.current) {
      const backgroundDuration = (Date.now() - backgroundTime.current) / (1000 * 60)
      
      if (backgroundDuration >= VIDEO_SPLASH_CONFIG.backgroundThresholdMinutes) {
        setShowVideoSplash(true)
      }
    } else {
      // No background time means app was terminated and restarted
      setShowVideoSplash(true)
    }
  }

  // Handle auth navigation (only after video is done or if not showing video)
  useEffect(() => {
    // Don't navigate if we're showing video splash
    if (showVideoSplash) {
      return
    }
    
    if (!loading && !showVideoSplash && isFirstLaunch !== null) {
      if (!user) {
        router.replace('/(auth)/login')
      } else if (user && !profile) {
        router.replace('/(auth)/create-profile')
      } else if (user && profile) {
        router.replace('/(tabs)')
      }
    }
  }, [user, profile, loading, showVideoSplash, isFirstLaunch])

  // Handle video splash completion
  const handleVideoComplete = () => {
    setShowVideoSplash(false)
    // Don't mark as seen so it shows every time
  }

  // Show video splash screen
  if (showVideoSplash) {
    return <VideoSplashScreen onComplete={handleVideoComplete} />
  }

  // Show simple loading screen while checking auth state
  return (
    <View className="flex-1 bg-black items-center justify-center">
      <Text className="text-white text-lg">Loading...</Text>
    </View>
  )
} 