import { View, Text, FlatList, TouchableOpacity, Alert, Image, TextInput, ScrollView, Dimensions } from 'react-native'
import GifLoadingIndicator from '../../components/GifLoadingIndicator'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '../../contexts/AuthContext'
import { useTutorial } from '../../contexts/TutorialContext'
import { useTutorialElement } from '../../hooks/useTutorialElement'
import { friendsDiscoverySteps, tutorialCompletedStep } from '../../utils/tutorialSteps'
import { supabase } from '../../../lib/supabase'
import { useRouter, useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface Profile {
  user_id: string
  username: string
  display_name?: string
  avatar_url?: string
  created_at: string
  is_private?: boolean
  allow_friend_requests?: boolean
  show_stories_to_friends_only?: boolean
}

interface Friend {
  user_id: string
  friend_id: string
  created_at: string
  friend_profile: Profile
}

interface FriendRequest {
  id: number
  from_id: string
  to_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  from_profile: Profile
}

interface CircleSuggestion {
  id: string
  name: string
  member_count: number
  recent_activity: number
  score: number
  similarity_reason: string
}

interface CircleInvitation {
  id: string;
  circle_id: string;
  circle_name: string;
  from_user_id: string;
  from_username: string;
  from_avatar_url?: string;
  created_at: string;
}

export default function FriendsScreen() {
  const { user } = useAuth()
  const { 
    checkAndStartTutorial, 
    progress, 
    isShowingTutorial, 
    currentTutorial, 
    currentStep, 
    nextStep, 
    completeTutorial, 
    hasQueuedTutorial,
    tutorialSteps,
    updateStepTargetElement
  } = useTutorial()
  const router = useRouter()
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([])
  const [circleInvitations, setCircleInvitations] = useState<CircleInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [circleSuggestions, setCircleSuggestions] = useState<CircleSuggestion[]>([])
  const [loadingCircleSuggestions, setLoadingCircleSuggestions] = useState(false)
  const [activeTab, setActiveTab] = useState<'friends' | 'circles'>('friends')
  const [hasJustCompletedCircleChat, setHasJustCompletedCircleChat] = useState(false)
  const screenWidth = Dimensions.get('window').width
  const [elementPositions, setElementPositions] = useState<Record<string, any>>({})
  
  // Ref to track if we've already attempted to start the tutorial
  const hasAttemptedTutorialStart = useRef(false)
  
  // Debug log when hasSeenCircleChat changes
  React.useEffect(() => {

  }, [progress.hasSeenCircleChat]);
  
  // Reset the flag when tutorial state changes or screen loses focus
  React.useEffect(() => {
    if (!isShowingTutorial && hasAttemptedTutorialStart.current && progress.hasSeenFriendsDiscovery) {
      hasAttemptedTutorialStart.current = false;
    }
  }, [isShowingTutorial, progress.hasSeenFriendsDiscovery]);
  
  // Reset the flag when screen loses focus
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        // Reset when leaving the screen
        if (!progress.hasSeenFriendsDiscovery) {
          hasAttemptedTutorialStart.current = false;
        }
      };
    }, [progress.hasSeenFriendsDiscovery])
  );

  // Tutorial element registration callback
  const handleElementMeasure = useCallback((stepId: string, position: any) => {
    setElementPositions(prev => {
      const existingPos = prev[stepId];
      
      // If tutorial is already showing and we have a position, only update if the change is small
      if (isShowingTutorial && existingPos) {
        const yDiff = Math.abs(position.y - existingPos.y);
        // If position changed by more than 50 pixels while tutorial is showing, ignore it
        // This prevents layout shifts from disrupting the tutorial
        if (yDiff > 50) {
          return prev;
        }
      }
      
      // Only update if the position actually changed
      if (!existingPos || 
          existingPos.x !== position.x || 
          existingPos.y !== position.y || 
          existingPos.width !== position.width || 
          existingPos.height !== position.height) {
    
        return { ...prev, [stepId]: position };
      }
      return prev;
    });
  }, [isShowingTutorial]);

  // Tutorial element refs
  const searchAreaElement = useTutorialElement('friends-1', handleElementMeasure, []);
  const discoverCirclesTabElement = useTutorialElement('friends-2', handleElementMeasure, [activeTab]);
  const joinButtonElement = useTutorialElement('friends-3', handleElementMeasure, []);
  const refreshButtonElement = useTutorialElement('friends-4', handleElementMeasure, []);
  const sprintsTabElement = useTutorialElement('friends-5', handleElementMeasure, []);

  // Ensure elements are measured when needed for tutorial steps
  useEffect(() => {
    if (currentTutorial === 'friendsDiscovery' && isShowingTutorial) {
      // For step 3 (index 2), ensure join button is measured
      if (currentStep === 2 && activeTab === 'circles' && circleSuggestions.length > 0) {
        setTimeout(() => {
          joinButtonElement.measure();
        }, 300);
      }
      
      // For step 4 (index 3), ensure refresh button is measured and visible
      if (currentStep === 3 && activeTab === 'circles') {
        setTimeout(() => {
          refreshButtonElement.measure();
          
          // Check if the position was captured and update the tutorial step
          setTimeout(() => {
            if (elementPositions['friends-4']) {
              // Update the tutorial step with the measured position
              updateStepTargetElement('friends-4', elementPositions['friends-4']);
            } else {
              // Force another measurement
              refreshButtonElement.measure();
            }
          }, 200);
        }, 300);
      }
    }
  }, [currentStep, currentTutorial, activeTab, isShowingTutorial, circleSuggestions.length, elementPositions, updateStepTargetElement]);

  // Check if circle chat was just completed (within last 2 minutes)
  useEffect(() => {
    const checkRecentCompletion = async () => {
      try {
        const lastCompleted = await AsyncStorage.getItem('circleChat_completed_at');
        
        if (lastCompleted) {
          const completedAt = parseInt(lastCompleted);
          const now = Date.now();
          const twoMinutesAgo = now - 120000; // 2 minutes
          const timeSinceCompletion = now - completedAt;
          
          if (completedAt > twoMinutesAgo) {
            setHasJustCompletedCircleChat(true);
          }
        }
              } catch (error) {
          // Error checking completion timestamp handled silently
        }
    };
    
    checkRecentCompletion();
  }, []);

  // Start the friends tutorial if coming from previous tutorials
  useEffect(() => {
    if (user && !progress.hasSeenFriendsDiscovery) {
      // Check if we should start friends tutorial
      const shouldStartFriends = (
        currentTutorial === 'welcome' || // Coming from welcome tutorial
        (progress.hasSeenCircleChat && !currentTutorial && !isShowingTutorial) || // After circle chat tutorial completed
        (hasQueuedTutorial('friendsDiscovery') && !currentTutorial && !isShowingTutorial) || // Or if queued and no current tutorial
        (hasJustCompletedCircleChat && !currentTutorial && !isShowingTutorial) // Or if just completed circle chat
      );
      
      if (shouldStartFriends) {

        
        // Complete the current tutorial first if needed
        if (currentTutorial === 'welcome') {
          completeTutorial();
          return; // Let the next render handle starting the friends tutorial
        }
        
        // Ensure elements are measured first
        searchAreaElement.measure();
        discoverCirclesTabElement.measure();
        sprintsTabElement.measure();
        
        // Then start the friends tutorial with a slight delay
        setTimeout(() => {
          // Check if we have the required element positions
          const requiredElements = ['friends-1', 'friends-2', 'friends-5'];
          const hasAllRequired = requiredElements.every(id => elementPositions[id] && elementPositions[id].width > 0);
          
          if (hasAllRequired && !hasAttemptedTutorialStart.current) {
            hasAttemptedTutorialStart.current = true;
            
            // Update steps with measured positions
            const stepsWithPositions = friendsDiscoverySteps.map(step => {
              const baseStep: any = {
                ...step,
                targetElement: elementPositions[step.id] || null,
                highlightColor: '#10B981',
              };
              
              // Add interaction handler for Discover Circles tab
              if (step.id === 'friends-2') {
                baseStep.onTargetPress = () => {

                  setActiveTab('circles');
                  nextStep();
                };
              }
              
              // For refresh button, provide a placeholder if position not available yet
              if (step.id === 'friends-4' && !elementPositions[step.id]) {

                // The position will be updated when we switch to circles tab
              }
              
              return baseStep;
            });
            
            // Add a final step to guide back to Sprints
            const finalStep = {
              id: 'friends-5',
              title: 'Start Your First Sprint! 🚀',
              description: 'Great job! Now you\'re ready to start studying. Tap the Sprints tab to begin your first study session!',
              targetElement: elementPositions['friends-5'],
              tooltipPosition: 'top' as const,
              highlightColor: '#10B981',
              requiresInteraction: true,
              onTargetPress: () => {

                // Complete the friends tutorial
                completeTutorial();
                // Navigate to sprints tab after a small delay
                setTimeout(() => {
                  router.push('/(tabs)/sprints');
                }, 100);
              }
            };
            
            const allSteps = [...stepsWithPositions, finalStep];
            checkAndStartTutorial('friendsDiscovery', allSteps);
          }
        }, 800); // Increased delay to ensure tutorial context has updated
      }
    }
  }, [user, currentTutorial, progress.hasSeenFriendsDiscovery, progress.hasSeenCircleChat, hasQueuedTutorial, hasJustCompletedCircleChat, elementPositions, isShowingTutorial]);

  // Measure tutorial elements when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      // Reset the flag when screen gains focus if tutorial hasn't been seen
      if (!progress.hasSeenFriendsDiscovery && !isShowingTutorial) {
        hasAttemptedTutorialStart.current = false;
      }
      
      setTimeout(() => {
        searchAreaElement.measure();
        discoverCirclesTabElement.measure();
        sprintsTabElement.measure();
        refreshButtonElement.measure(); // Always measure since it's always in DOM now
        // joinButtonElement will be measured when circles tab is active
        if (activeTab === 'circles' && circleSuggestions.length > 0) {
          joinButtonElement.measure();
        }
      }, 300);
    }, [activeTab, circleSuggestions.length, progress.hasSeenFriendsDiscovery, isShowingTutorial])
  );

  // Track previous active tab
  const [prevActiveTab, setPrevActiveTab] = useState(activeTab);

  // Measure join button and refresh button when circles tab is active
  useEffect(() => {
    // Only log when tutorial is active and tab switch might matter
    if (currentTutorial === 'friendsDiscovery' && isShowingTutorial && prevActiveTab !== activeTab) {

    }
    
    if (activeTab === 'circles') {
      setTimeout(() => {
        refreshButtonElement.measure();
        if (circleSuggestions.length > 0) {
          joinButtonElement.measure();
        }
        
        // If we're in the tutorial and just switched to circles tab
        if (currentTutorial === 'friendsDiscovery' && isShowingTutorial) {
          // Load suggestions if they haven't been loaded yet
          if (circleSuggestions.length === 0) {
            loadCircleSuggestions();
          }
          
          // If we just switched from friends to circles tab and we're on step 2 (index 1)
          if (prevActiveTab === 'friends' && currentStep === 1) {
            setTimeout(() => {
              nextStep();
            }, 500);
          }
          
          // Ensure refresh button is measured for step 4
          if ((currentStep === 2 || currentStep === 3) && activeTab === 'circles') { // Step 3 or 4
            setTimeout(() => {
              refreshButtonElement.measure();
              // Update the tutorial step with the refresh button position if available
              setTimeout(() => {
                if (elementPositions['friends-4']) {
                  updateStepTargetElement('friends-4', elementPositions['friends-4']);
                }
              }, 100);
            }, 100);
          }
        }
      }, 300);
    }
    
    // Update previous tab
    setPrevActiveTab(activeTab);
  }, [activeTab, circleSuggestions.length, currentTutorial, isShowingTutorial, currentStep, prevActiveTab, elementPositions, updateStepTargetElement]);

  // Also check when screen comes into focus (when user navigates here from chat tutorial)
  useFocusEffect(
    React.useCallback(() => {
      const checkFriendsDocumentStart = async () => {
        // Re-check recent completion on focus
        let recentlyCompleted = false;
        let lastCompleted: string | null = null;
        
        try {
          lastCompleted = await AsyncStorage.getItem('circleChat_completed_at');
          if (lastCompleted) {
            const completedAt = parseInt(lastCompleted);
            const now = Date.now();
            const twoMinutesAgo = now - 120000; // 2 minutes
            recentlyCompleted = completedAt > twoMinutesAgo;
          }
        } catch (error) {
          // Error checking completion timestamp handled silently
        }

        // Check if should start friends tutorial when screen focuses


        if (user && !progress.hasSeenFriendsDiscovery && !currentTutorial && !isShowingTutorial) {
          // Check if we should start friends tutorial (either from circle chat completion OR queued)
          const shouldStart = progress.hasSeenCircleChat || hasQueuedTutorial('friendsDiscovery') || recentlyCompleted;
          

          
          if (shouldStart) {
            // This is a fallback in case the main useEffect didn't trigger
            // Don't use hasAttemptedTutorialStart here as it might have been set in the other useEffect

            
            // Ensure all elements are measured before starting
            searchAreaElement.measure();
            discoverCirclesTabElement.measure();
            sprintsTabElement.measure();
            if (activeTab === 'circles') {
              refreshButtonElement.measure();
              if (circleSuggestions.length > 0) {
                joinButtonElement.measure();
              }
            }
            
            // Wait for measurements to complete
            setTimeout(() => {
              // Check if we have the required element positions
              const requiredElements = ['friends-1', 'friends-2', 'friends-5'];
              const hasAllRequired = requiredElements.every(id => elementPositions[id] && elementPositions[id].width > 0);
              
              // Also check if tutorial isn't already showing (from the other useEffect)
              if (hasAllRequired && !isShowingTutorial && !currentTutorial) {

                // Update steps with measured positions
                const stepsWithPositions = friendsDiscoverySteps.map(step => {
                  const baseStep: any = {
                    ...step,
                    targetElement: elementPositions[step.id] || null,
                    highlightColor: '#10B981',
                  };
                  
                  // Add interaction handler for Discover Circles tab
                  if (step.id === 'friends-2') {
                    baseStep.requiresInteraction = true;
                    baseStep.onTargetPress = () => {

                      setActiveTab('circles');
                      // Small delay to ensure tab switch completes
                      setTimeout(() => {

                        nextStep();
                      }, 300);
                    };
                  }
                  
                  // Element position available in elementPositions[step.id]
                  
                  // For refresh button (friends-4), check if we need to provide a placeholder
                  if (step.id === 'friends-4' && !elementPositions[step.id]) {

                    // The position will be updated when we switch to circles tab
                  }
                  
                  return baseStep;
                });
                
                // Add a final step to guide back to Sprints
                const finalStep = {
                  id: 'friends-5',
                  title: 'Start Your First Sprint! 🚀',
                  description: 'Great job! Now you\'re ready to start studying. Tap the Sprints tab to begin your first study session!',
                  targetElement: elementPositions['friends-5'],
                  tooltipPosition: 'top' as const,
                  highlightColor: '#10B981',
                  requiresInteraction: true,
                  onTargetPress: () => {

                    // Complete the friends tutorial
                    completeTutorial();
                    // Navigate to sprints tab after a small delay
                    setTimeout(() => {
                      router.push('/(tabs)/sprints');
                    }, 100);
                  }
                };
                
                const allSteps = [...stepsWithPositions, finalStep];
                const started = checkAndStartTutorial('friendsDiscovery', allSteps);
              }
            }, 500); // Increased delay to ensure measurements complete
          }
        }
      };

      checkFriendsDocumentStart();
    }, [user, progress.hasSeenFriendsDiscovery, progress.hasSeenCircleChat, currentTutorial, hasQueuedTutorial, isShowingTutorial, elementPositions])
  );

  useEffect(() => {
    if (user) {
      loadFriends()
      loadFriendRequests()
      loadCircleInvitations()
      if (activeTab === 'circles') {
        loadCircleSuggestions()
      }
    }
  }, [user, activeTab])

  const loadFriends = async () => {
    if (!user) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('friends')
        .select(`
          *,
          friend_profile:profiles!friends_friend_id_fkey(*)
        `)
        .eq('user_id', user.id)

      if (error) {
        console.error('Error loading friends:', error)
      } else {
        setFriends(data || [])
      }
    } catch (error) {
      console.error('Error loading friends:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadFriendRequests = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select(`
          *,
          from_profile:profiles!friend_requests_from_id_fkey(*)
        `)
        .eq('to_id', user.id)
        .eq('status', 'pending')

      if (error) {
        console.error('Error loading friend requests:', error)
      } else {
        setFriendRequests(data || [])
      }
    } catch (error) {
      console.error('Error loading friend requests:', error)
    }
  }

  const loadCircleInvitations = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase.rpc('get_pending_circle_invitations')

      if (error) {
        console.error('Error loading circle invitations:', error)
      } else {
        setCircleInvitations(data || [])
      }
    } catch (error) {
      console.error('Error loading circle invitations:', error)
    }
  }

  const loadCircleSuggestions = async () => {
    if (!user || loadingCircleSuggestions) return

    setLoadingCircleSuggestions(true)
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generateCircleSuggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          userId: user.id
        })
      })

      const result = await response.json()

      if (response.ok) {
        setCircleSuggestions(result.suggestions || [])
      } else {
        console.error('Failed to load circle suggestions:', result)
        setCircleSuggestions([])
      }
    } catch (error) {
      console.error('Error loading circle suggestions:', error)
      setCircleSuggestions([])
    } finally {
      setLoadingCircleSuggestions(false)
    }
  }

  const searchUsers = async (query: string) => {
    if (!query.trim() || !user) {
      setSearchResults([])
      return
    }

    setSearchLoading(true)
    
    try {
      // Get current user's friends list to check if private accounts are already friends
      const { data: friendsData } = await supabase
        .from('friends')
        .select('friend_id')
        .eq('user_id', user.id);

      const friendIds = new Set(friendsData?.map(f => f.friend_id) || []);

      const { data: allProfiles, error } = await supabase
        .from('profiles')
        .select('*')

      if (error) {
        console.error('Error fetching profiles:', error)
        setSearchResults([])
        return
      }

      if (allProfiles) {
        const searchTerm = query.trim().toLowerCase()
        const filtered = allProfiles
          .filter(profile => profile.user_id !== user.id)
          .filter(profile => {
            const usernameMatch = profile.username?.toLowerCase().includes(searchTerm)
            const displayNameMatch = profile.display_name?.toLowerCase().includes(searchTerm)
            return usernameMatch || displayNameMatch
          })
          // Filter out private accounts that don't allow friend requests
          .filter(profile => {
            // If allow_friend_requests is false, don't show in search
            return profile.allow_friend_requests !== false
          })
          // Filter out private accounts unless they're already friends
          .filter(profile => {
            // If account is private and user is not already a friend, don't show in search
            if (profile.is_private && !friendIds.has(profile.user_id)) {
              return false
            }
            return true
          })
        
        setSearchResults(filtered)
      } else {
        setSearchResults([])
      }
    } catch (error) {
      console.error('Error searching users:', error)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  const sendFriendRequest = async (toUserId: string) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to send friend requests.')
      return
    }

    try {
      const { data: targetProfile, error: profileError } = await supabase
        .from('profiles')
        .select('allow_friend_requests, username')
        .eq('user_id', toUserId)
        .single()

      if (profileError) {
        console.error('Error checking user profile:', profileError)
        Alert.alert('Error', 'Failed to send friend request.')
        return
      }

      if (targetProfile.allow_friend_requests === false) {
        Alert.alert('Cannot Send Request', `${targetProfile.username || 'This user'} is not accepting friend requests.`)
        return
      }

      const { error } = await supabase
        .from('friend_requests')
        .insert({
          from_id: user.id,
          to_id: toUserId,
          status: 'pending'
        })

      if (error) {
        console.error('Error sending friend request:', error)
        if (error.message.includes('duplicate key value')) {
          Alert.alert('Request Already Sent', 'You have already sent a friend request to this user.')
        } else {
          Alert.alert('Error', `Failed to send friend request: ${error.message}`)
        }
      } else {
        Alert.alert('Success', 'Friend request sent!')
        setSearchResults(prev => prev.filter(p => p.user_id !== toUserId))
      }
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error('An unexpected error occurred.')
      console.error('Caught exception in sendFriendRequest:', err)
      Alert.alert('Error', err.message)
    }
  }

  const respondToFriendRequest = async (requestId: number, status: 'accepted' | 'rejected') => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('friend_requests')
        .update({ status })
        .eq('id', requestId)

      if (error) {
        Alert.alert('Error', 'Failed to respond to friend request')
        return
      }

      if (status === 'accepted') {
        const request = friendRequests.find(r => r.id === requestId)
        if (request) {
          const { error: friendError } = await supabase
            .from('friends')
            .insert([
              { user_id: user.id, friend_id: request.from_id },
              { user_id: request.from_id, friend_id: user.id }
            ])

          if (friendError) {
            console.error('Error adding friend:', friendError)
          } else {
            loadFriends()
          }
        }
      }

      loadFriendRequests()
    } catch (error) {
      Alert.alert('Error', 'Failed to respond to friend request')
    }
  }

  const removeFriend = async (friendId: string) => {
    if (!user) return

    Alert.alert(
      'Remove Friend',
      'Are you sure you want to remove this friend?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('friends')
                .delete()
                .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)

              if (error) {
                Alert.alert('Error', 'Failed to remove friend')
              } else {
                loadFriends()
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to remove friend')
            }
          }
        }
      ]
    )
  }

  const joinCircle = async (circleId: string) => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('circle_members')
        .insert({
          circle_id: circleId,
          user_id: user.id,
          role: 'member'
        })

      if (error) {
        if (error.message.includes('duplicate key')) {
          Alert.alert('Already a Member', 'You are already a member of this circle.')
        } else {
          Alert.alert('Error', 'Failed to join circle. Please try again.')
        }
      } else {
        Alert.alert('Success', 'Successfully joined the circle!')
        // Remove the suggestion from the list
        setCircleSuggestions(prev => prev.filter(s => s.id !== circleId))
      }
    } catch (error) {
      console.error('Error joining circle:', error)
      Alert.alert('Error', 'Failed to join circle. Please try again.')
    }
  }

  const respondToCircleInvitation = async (invitationId: string, response: 'accepted' | 'declined') => {
    if (!user) return

    try {
      const { data, error } = await supabase.rpc('respond_to_circle_invitation', {
        p_invitation_id: invitationId,
        p_response: response
      })

      if (error) throw error

      if (data?.error) {
        Alert.alert('Error', data.error)
      } else if (response === 'accepted' && data?.circle_id) {
        Alert.alert(
          'Success',
          `You've joined ${data.circle_name}!`,
          [
            {
              text: 'Open Circle',
              onPress: () => router.push(`/(pages)/chat?circleId=${data.circle_id}`)
            },
            { text: 'OK' }
          ]
        )
      }

      // Reload invitations
      loadCircleInvitations()
    } catch (error) {
      console.error('Error responding to circle invitation:', error)
      Alert.alert('Error', 'Failed to respond to invitation')
    }
  }

  const renderFriend = ({ item }: { item: Friend }) => (
    <View className="mx-6 mb-4 bg-gray-800/50 rounded-2xl p-4 flex-row items-center">
      <View className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full items-center justify-center mr-4">
        {item.friend_profile.avatar_url ? (
          <Image 
            source={{ uri: item.friend_profile.avatar_url }} 
            className="w-16 h-16 rounded-full"
          />
        ) : (
          <Image 
            source={require('../../../assets/images/avatar-placeholder.png')} 
            className="w-16 h-16 rounded-full"
            resizeMode="cover"
          />
        )}
      </View>
      
      <View className="flex-1">
        <Text className="text-white text-lg font-bold">
          {item.friend_profile.display_name || item.friend_profile.username}
        </Text>
        <Text className="text-gray-400 text-sm">@{item.friend_profile.username}</Text>
      </View>
      
      <TouchableOpacity
        onPress={() => removeFriend(item.friend_id)}
        className="w-10 h-10 bg-red-500/20 rounded-full items-center justify-center"
      >
        <Feather name="user-minus" size={16} color="#ef4444" />
      </TouchableOpacity>
    </View>
  )

  const renderSearchResult = ({ item }: { item: Profile }) => (
    <View className="mx-6 mb-4 bg-gray-800/50 rounded-2xl p-4 flex-row items-center">
      <View className="w-16 h-16 bg-gradient-to-br from-green-500 to-blue-600 rounded-full items-center justify-center mr-4">
        {item.avatar_url ? (
          <Image 
            source={{ uri: item.avatar_url }} 
            className="w-16 h-16 rounded-full"
          />
        ) : (
          <Image 
            source={require('../../../assets/images/avatar-placeholder.png')} 
            className="w-16 h-16 rounded-full"
            resizeMode="cover"
          />
        )}
      </View>
      
      <View className="flex-1">
        <Text className="text-white text-lg font-bold">
          {item.display_name || item.username}
        </Text>
        <Text className="text-gray-400 text-sm">@{item.username}</Text>
      </View>
      
      <TouchableOpacity
        onPress={() => sendFriendRequest(item.user_id)}
        className="bg-blue-500 px-4 py-2 rounded-full"
      >
        <Text className="text-white font-bold">Add</Text>
      </TouchableOpacity>
    </View>
  )

  const renderFriendRequest = ({ item }: { item: FriendRequest }) => (
    <View className="mx-6 mb-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
      <View className="flex-row items-center mb-3">
        <View className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-full items-center justify-center mr-4">
          {item.from_profile.avatar_url ? (
            <Image 
              source={{ uri: item.from_profile.avatar_url }} 
              className="w-16 h-16 rounded-full"
            />
          ) : (
            <Image 
              source={require('../../../assets/images/avatar-placeholder.png')} 
              className="w-16 h-16 rounded-full"
              resizeMode="cover"
            />
          )}
        </View>
        
        <View className="flex-1">
          <Text className="text-white text-lg font-bold">
            {item.from_profile.display_name || item.from_profile.username}
          </Text>
          <Text className="text-gray-400 text-sm">@{item.from_profile.username}</Text>
          <Text className="text-yellow-400 text-xs">wants to be your friend</Text>
        </View>
      </View>
      
      <View className="flex-row gap-3">
        <TouchableOpacity
          onPress={() => respondToFriendRequest(item.id, 'accepted')}
          className="flex-1 bg-green-500 rounded-xl py-3 items-center"
        >
          <Text className="text-white font-bold">Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => respondToFriendRequest(item.id, 'rejected')}
          className="flex-1 bg-red-500 rounded-xl py-3 items-center"
        >
          <Text className="text-white font-bold">Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  const renderCircleSuggestion = ({ item }: { item: CircleSuggestion }) => (
    <View className="mx-6 mb-4 bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4">
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-1">
          <Text className="text-white text-lg font-bold mb-1">{item.name}</Text>
          <Text className="text-purple-400 text-sm mb-2">{item.similarity_reason}</Text>
          <View className="flex-row items-center space-x-4">
            <View className="flex-row items-center">
              <Feather name="users" size={12} color="#9CA3AF" />
              <Text className="text-gray-400 text-xs ml-1">
                {item.member_count} members
              </Text>
            </View>
            <View className="flex-row items-center">
              <Feather name="activity" size={12} color="#9CA3AF" />
              <Text className="text-gray-400 text-xs ml-1">
                {item.recent_activity} recent sprints
              </Text>
            </View>
          </View>
        </View>
        <View ref={circleSuggestions.indexOf(item) === 0 ? joinButtonElement.ref : undefined} collapsable={false}>
          <TouchableOpacity
            onPress={() => joinCircle(item.id)}
            className="bg-purple-600 rounded-lg px-4 py-2 ml-3"
          >
            <Text className="text-white text-sm font-medium">Join</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )

  const renderCircleInvitation = ({ item }: { item: CircleInvitation }) => (
    <View className="mx-6 mb-4 bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4">
      <View className="flex-row items-center mb-3">
        <View className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full items-center justify-center mr-4">
          {item.from_avatar_url ? (
            <Image 
              source={{ uri: item.from_avatar_url }} 
              className="w-16 h-16 rounded-full"
            />
          ) : (
            <Image 
              source={require('../../../assets/images/avatar-placeholder.png')} 
              className="w-16 h-16 rounded-full"
              resizeMode="cover"
            />
          )}
        </View>
        
        <View className="flex-1">
          <Text className="text-white text-lg font-bold">
            {item.circle_name}
          </Text>
          <Text className="text-gray-400 text-sm">@{item.from_username} invited you</Text>
          <Text className="text-purple-400 text-xs">to join this circle</Text>
        </View>
      </View>
      
      <View className="flex-row gap-3">
        <TouchableOpacity
          onPress={() => respondToCircleInvitation(item.id, 'accepted')}
          className="flex-1 bg-green-500 rounded-xl py-3 items-center"
        >
          <Text className="text-white font-bold">Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => respondToCircleInvitation(item.id, 'declined')}
          className="flex-1 bg-red-500 rounded-xl py-3 items-center"
        >
          <Text className="text-white font-bold">Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <SafeAreaView className="flex-1 bg-black" onLayout={() => {
      // Re-measure elements after SafeAreaView layout is complete
      if (isShowingTutorial && currentTutorial === 'friendsDiscovery') {
        setTimeout(() => {
          searchAreaElement.measure();
          discoverCirclesTabElement.measure();
          sprintsTabElement.measure();
          if (activeTab === 'circles') {
            refreshButtonElement.measure();
          }
        }, 100);
      }
    }}>
      {/* Header */}
      <View className="px-6 py-4 flex-row items-center justify-between">
        <View>
          <Text className="text-white text-3xl font-bold">
            {activeTab === 'friends' ? 'Friends' : 'Discover Circles'}
          </Text>
          <Text className="text-gray-400 text-sm">
            {activeTab === 'friends' 
              ? `${friends.length} friends` 
              : 'Find study groups based on your interests'
            }
          </Text>
        </View>
        <View className="flex-row gap-4">
          {activeTab === 'friends' && (friendRequests.length > 0 || circleInvitations.length > 0) && (
            <View className="relative">
              <View className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full items-center justify-center z-10">
                <Text className="text-white text-xs font-bold">{friendRequests.length + circleInvitations.length}</Text>
              </View>
              <TouchableOpacity 
                onPress={() => router.push('/(pages)/search-friends' as any)}
                className="w-12 h-12 bg-yellow-500 rounded-full items-center justify-center"
              >
                <Feather name="user-plus" size={20} color="white" />
              </TouchableOpacity>
            </View>
          )}
          {activeTab === 'friends' && (
            <TouchableOpacity 
              ref={searchAreaElement.ref}
              onPress={() => router.push('/(pages)/search-friends' as any)}
              className="w-12 h-12 bg-blue-500 rounded-full items-center justify-center"
            >
              <Feather name="search" size={20} color="white" />
            </TouchableOpacity>
          )}
          {activeTab === 'circles' && (
            <View ref={refreshButtonElement.ref} collapsable={false}>
              <TouchableOpacity 
                onPress={loadCircleSuggestions}
                disabled={loadingCircleSuggestions}
                className="w-12 h-12 bg-purple-500 rounded-full items-center justify-center"
              >
                <Feather 
                  name={loadingCircleSuggestions ? "loader" : "refresh-cw"} 
                  size={20} 
                  color="white" 
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Tab Navigation */}
      <View className="px-6 mb-4">
        <View className="flex-row bg-gray-900 rounded-xl p-1">
          <TouchableOpacity
            onPress={() => setActiveTab('friends')}
            className={`flex-1 py-3 px-4 rounded-lg ${
              activeTab === 'friends' ? 'bg-blue-500' : 'bg-transparent'
            }`}
          >
            <Text className={`text-center font-semibold ${
              activeTab === 'friends' ? 'text-white' : 'text-gray-400'
            }`}>
              Friends
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            ref={discoverCirclesTabElement.ref}
            onPress={() => {
              setActiveTab('circles');
            }}
            className={`flex-1 py-3 px-4 rounded-lg ${
              activeTab === 'circles' ? 'bg-purple-500' : 'bg-transparent'
            }`}
          >
            <Text className={`text-center font-semibold ${
              activeTab === 'circles' ? 'text-white' : 'text-gray-400'
            }`}>
              Discover Circles
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content Area */}
      <View className="flex-1">
        {activeTab === 'friends' ? (
          // Friends Tab
          loading ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-white text-lg">Loading friends...</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
              {/* Friend Requests Section */}
              {friendRequests.length > 0 && (
                <View className="mb-6">
                  <Text className="text-white text-lg font-bold px-6 mb-4">
                    Friend Requests ({friendRequests.length})
                  </Text>
                  {friendRequests.map((request) => (
                    <View key={request.id}>
                      {renderFriendRequest({ item: request } as any)}
                    </View>
                  ))}
                </View>
              )}

              {/* Circle Invitations Section */}
              {circleInvitations.length > 0 && (
                <View className="mb-6">
                  <Text className="text-white text-lg font-bold px-6 mb-4">
                    Circle Invitations ({circleInvitations.length})
                  </Text>
                  {circleInvitations.map((invitation) => (
                    <View key={invitation.id}>
                      {renderCircleInvitation({ item: invitation } as any)}
                    </View>
                  ))}
                </View>
              )}

              {/* Friends List Section */}
              <View>
                <Text className="text-white text-lg font-bold px-6 mb-4">
                  Your Friends ({friends.length})
                </Text>
                {friends.length === 0 ? (
                  <View className="items-center justify-center px-8 py-16">
                    <View className="w-32 h-32 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full items-center justify-center mb-8">
                      <Feather name="users" size={60} color="white" />
                    </View>
                    <Text className="text-white text-2xl font-bold text-center mb-4">No Friends Yet</Text>
                    <Text className="text-gray-400 text-center text-lg">
                      Start connecting with people to build your friend network
                    </Text>
                    <TouchableOpacity
                      onPress={() => router.push('/(pages)/search-friends' as any)}
                      className="mt-6 bg-blue-500 px-6 py-3 rounded-xl"
                    >
                      <Text className="text-white font-semibold">Find Friends</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  friends.map((friend) => (
                    <View key={`${friend.user_id}-${friend.friend_id}`}>
                      {renderFriend({ item: friend } as any)}
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )
        ) : (
          // Circles Tab
          loadingCircleSuggestions ? (
            <View className="flex-1 items-center justify-center">
              <GifLoadingIndicator size="large" color="#A855F7" />
              <Text className="text-white text-lg mt-4">Finding circles for you...</Text>
              <Text className="text-gray-400 text-sm mt-2 text-center px-8">
                Using AI to match you with study groups based on your interests
              </Text>
            </View>
          ) : circleSuggestions.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <View className="w-32 h-32 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full items-center justify-center mb-8">
                <Feather name="compass" size={60} color="white" />
              </View>
              <Text className="text-white text-2xl font-bold text-center mb-4">No Suggestions Yet</Text>
              <Text className="text-gray-400 text-center text-lg mb-6">
                Complete a few study sprints to get personalized circle recommendations
              </Text>
              <TouchableOpacity
                onPress={loadCircleSuggestions}
                className="bg-purple-500 px-6 py-3 rounded-xl"
              >
                <Text className="text-white font-semibold">Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="px-6 py-4">
                <Text className="text-purple-400 text-sm mb-4">
                  🎯 Based on your study history and interests
                </Text>
              </View>
              <FlatList
                data={circleSuggestions}
                renderItem={renderCircleSuggestion}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                contentContainerStyle={{ paddingBottom: 100 }}
              />
            </ScrollView>
          )
        )}
      </View>
      
      {/* Sprints tab reference - positioned at bottom for tutorial */}
      <View 
        style={{ 
          position: 'absolute', 
          bottom: 34, // Raised a little higher to align with icon
          left: (screenWidth * 0.625) - 22, // Third tab position (Sprints) minus half icon width
          width: 44, // Icon size plus padding
          height: 44, // Icon size plus padding
          pointerEvents: 'none' 
        }} 
        ref={sprintsTabElement.ref}
        collapsable={false}
      />
    </SafeAreaView>
  )
}
