import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { Session, User } from '@supabase/supabase-js'
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

  updateLastActive: () => Promise<void>
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
    // Sign up without email verification
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: undefined, // Disable email confirmation
        data: {
          email_confirm: false // Additional flag to skip confirmation
        }
      }
    });

    if (!error && data.user) {
      setSession(data.session);
      setUser(data.user);
    }
    
    return { error }
  }

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!error && data.user) {
        setSession(data.session);
        setUser(data.user);
        await loadProfile(data.user.id);
      }
      
      return { error };
    } catch (error) {
      console.error('Sign in failed:', error);
      return { error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const signInWithGoogle = async () => {
    // Implement Google Sign-In logic
    return { error: new Error('Not implemented') };
  };

  const createProfile = async (username: string, displayName?: string) => {
    if (!user) {
      const err = new Error('No user is available to create a profile.');
      console.error('createProfile:', err);
      return { error: err };
    }
    
    try {
      // Check if username is already taken
      const { data: existingProfile, error: existingProfileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username.toLowerCase())
        .single()

      if (existingProfile) {
        console.error('Username is already taken');
        return { error: new Error('Username is already taken') };
      }

      const { data, error } = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          username: username.toLowerCase(),
          display_name: displayName
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating profile in DB:', error);
        return { error };
      }
      
      console.log('Profile created successfully in DB:', data);
      setProfile(data);
      return { error: null };

    } catch (err: any) {
      const e = err instanceof Error ? err : new Error('An unexpected error occurred during profile creation.');
      console.error('Caught exception in createProfile:', e);
      return { error: e };
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error('User not logged in') };

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



  const updateLastActive = async () => {
    // Temporarily disabled to prevent database errors
    return;
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
    updateLastActive,
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