import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { Session, User } from '@supabase/supabase-js'
import * as Linking from 'expo-linking'
// import * as AuthSession from 'expo-auth-session'
// import * as WebBrowser from 'expo-web-browser'
import { supabase } from '../../lib/supabase'

// WebBrowser.maybeCompleteAuthSession()

interface Profile {
  user_id: string
  username: string
  display_name?: string
  avatar_url?: string
  created_at: string
  last_active?: string
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  signUp: (email: string, password: string) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<{ error: any }>
  createProfile: (username: string, displayName?: string) => Promise<{ error: any }>
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>
  refreshProfile: () => Promise<void>
  resendConfirmation: (email: string) => Promise<{ error: any }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const profileLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Handle deep links for email confirmation
    const handleDeepLink = async (url: string) => {
      // Parse the URL to extract tokens
      if (url.includes('#access_token=')) {
        const urlObj = new URL(url)
        const hashParams = new URLSearchParams(urlObj.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        
        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          if (error) {
            console.error('Error setting session from deep link:', error)
          }
        }
      }
    }

    // Listen for deep links
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url)
    })

    // Check if app was opened with a deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url)
      }
    })

    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Error getting session:', error)
        setLoading(false)
        return
      }
      
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        debouncedLoadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    }).catch((error) => {
      console.error('Error in getSession:', error)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        
        if (session?.user) {
          debouncedLoadProfile(session.user.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
      linkingSubscription?.remove()
      if (profileLoadTimeoutRef.current) {
        clearTimeout(profileLoadTimeoutRef.current)
      }
    }
  }, [])

  // Debounced profile loading to prevent race conditions
  const debouncedLoadProfile = (userId: string) => {
    // Clear any existing timeout
    if (profileLoadTimeoutRef.current) {
      clearTimeout(profileLoadTimeoutRef.current)
    }
    
    // Set a new timeout to load profile after a short delay
    profileLoadTimeoutRef.current = setTimeout(() => {
      loadProfile(userId)
    }, 100) // 100ms debounce
  }

  const loadProfile = async (userId: string, retryCount = 0) => {
    // Prevent duplicate loading attempts
    if (profileLoading) {
      return
    }

    setProfileLoading(true)
    // Don't set loading to false until we have a definitive result
    setLoading(true)
    
    try {
      // Add timeout to profile loading - longer timeout for better reliability
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single()
        
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Profile loading timeout')), 8000) // Increased to 8 seconds
      })
      
      const { data, error } = await Promise.race([profilePromise, timeoutPromise]) as any

      if (error) {
        if (error.code === 'PGRST116') {
          // No profile found - this is expected for new users
          setProfile(null)
          setLoading(false) // Only set loading false when we have definitive result
        } else if (error.message === 'Profile loading timeout' && retryCount < 2) {
          // Retry up to 2 times for timeouts
          setProfileLoading(false) // Reset flag before retry
          // Don't set loading to false - keep trying
          setTimeout(() => loadProfile(userId, retryCount + 1), 1000)
          return // Don't set loading to false yet
        } else if (error.message === 'Profile loading timeout') {
          setProfile(null)
          setLoading(false)
        } else {
          console.error('Error loading profile:', error)
          setProfile(null)
          setLoading(false)
        }
      } else if (data) {
        setProfile(data)
        setLoading(false)
      } else {
        setProfile(null)
        setLoading(false)
      }
    } catch (error) {
      console.error('Unexpected error loading profile:', error)
      setProfile(null)
      setLoading(false)
    } finally {
      setProfileLoading(false)
    }
  }

  const signUp = async (email: string, password: string) => {
    // Use a simple redirect URL that works for development
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'https://app.supabase.com'
      }
    })
    return { error }
  }

  const signIn = async (email: string, password: string) => {
    try {
      // Add timeout to prevent hanging
      const signInPromise = supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Sign in timeout')), 8000) // 8 second timeout
      })
      
      const result = await Promise.race([signInPromise, timeoutPromise])
      const { data, error } = result as any
      
      return { error }
    } catch (error) {
      console.error('Sign in failed:', error)
      return { error }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const signInWithGoogle = async () => {
    // TODO: Implement Google Sign In after installing packages
    return { error: new Error('Google Sign In not implemented yet') }
  }

  const createProfile = async (username: string, displayName?: string) => {
    if (!user) {
      return { error: 'No user found' }
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          username: username.toLowerCase(),
          display_name: displayName || username,
        })
        .select()
        .single()

      if (error) {
        return { error }
      } else if (data) {
        setProfile(data)
        return { error: null }
      } else {
        return { error: 'No data returned' }
      }
    } catch (error) {
      return { error }
    }
  }

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: 'No user found' }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .single()

    if (!error && data) {
      setProfile(data)
    }

    return { error }
  }

  const refreshProfile = async () => {
    if (user?.id) {
      await loadProfile(user.id)
    }
  }

  const resendConfirmation = async (email: string) => {
    // Use a simple redirect URL that works for development
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: 'https://app.supabase.com'
      }
    })
    return { error }
  }

  const value = {
    user,
    profile,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    signInWithGoogle,
    createProfile,
    updateProfile,
    refreshProfile,
    resendConfirmation,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 