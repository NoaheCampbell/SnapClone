import { View, Text, FlatList, TouchableOpacity, Alert, Dimensions } from 'react-native'
import GifLoadingIndicator from '../../components/GifLoadingIndicator'
import CustomPullToRefresh from '../../components/CustomPullToRefresh'
import React, { useState, useEffect, memo, useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useTutorial } from '../../contexts/TutorialContext'
import { useTutorialElement } from '../../hooks/useTutorialElement'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface CirclePreview {
  id: string
  name: string
  visibility: string
  sprint_minutes: number
  ttl_minutes: number
  role: string
  member_count: number
  last_message_at: string | null
  last_message_content: string | null
  last_message_sender: string | null
  last_message_media: boolean | null
}

// Memoized circle item component to prevent unnecessary re-renders
const MemoizedCircleItem = memo(({ 
  item, 
  onPress, 
  onLongPress, 
  formatTime 
}: { 
  item: CirclePreview; 
  onPress: (circle: CirclePreview) => void;
  onLongPress: (circle: CirclePreview) => void;
  formatTime: (timestamp: string) => string;
}) => {
  // Format last message preview
  const getLastMessagePreview = () => {
    if (!item.last_message_content && !item.last_message_media) {
      return null;
    }
    
    let preview = '';
    if (item.last_message_sender) {
      preview = `${item.last_message_sender}: `;
    }
    
    if (item.last_message_media) {
      preview += '📷 Photo';
    } else if (item.last_message_content) {
      // Truncate long messages
      const maxLength = 30;
      preview += item.last_message_content.length > maxLength 
        ? item.last_message_content.substring(0, maxLength) + '...'
        : item.last_message_content;
    }
    
    return preview;
  };
  
  const lastMessage = getLastMessagePreview();
  
  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      className="flex-row items-center p-4 border-b border-gray-800"
    >
      <View className="w-12 h-12 rounded-full bg-gray-600 items-center justify-center mr-3">
        <Feather name="users" size={20} color="white" />
      </View>
      
      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-1">
          <View className="flex-1 flex-row items-center">
            <Text className="text-white font-semibold text-base" numberOfLines={1}>
              {item.name}
            </Text>
            {item.visibility === 'public' && (
              <Feather name="globe" size={14} color="#9CA3AF" style={{ marginLeft: 8 }} />
            )}
          </View>
          {item.last_message_at && (
            <Text className="text-gray-400 text-xs" numberOfLines={1}>
              {formatTime(item.last_message_at)}
            </Text>
          )}
        </View>
        
        {/* Last message preview or member count */}
        {lastMessage ? (
          <Text className="text-gray-400 text-sm" numberOfLines={1}>
            {lastMessage}
          </Text>
        ) : (
          <View className="flex-row items-center">
            <Text className="text-gray-500 text-sm italic">
              {item.member_count} member{item.member_count !== 1 ? 's' : ''}
            </Text>
            {item.role === 'owner' && (
              <View className="flex-row items-center ml-2">
                <Feather name="star" size={12} color="#F59E0B" />
                <Text className="text-yellow-500 text-xs ml-1">Owner</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if specific properties change
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.name === nextProps.item.name &&
    prevProps.item.visibility === nextProps.item.visibility &&
    prevProps.item.member_count === nextProps.item.member_count &&
    prevProps.item.role === nextProps.item.role &&
    prevProps.item.last_message_at === nextProps.item.last_message_at &&
    prevProps.item.last_message_content === nextProps.item.last_message_content &&
    prevProps.item.last_message_sender === nextProps.item.last_message_sender &&
    prevProps.item.last_message_media === nextProps.item.last_message_media
  );
});

export default function InboxScreen() {
  const [circles, setCircles] = useState<CirclePreview[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastMessageTimes, setLastMessageTimes] = useState<Record<string, string>>({})
  const screenWidth = Dimensions.get('window').width
  
  // Tutorial setup
  const { checkAndStartTutorial, progress, isShowingTutorial, completeTutorial } = useTutorial();
  const [elementPositions, setElementPositions] = useState<Record<string, any>>({});
  
  // Tutorial element registration callback
  const handleElementMeasure = useCallback((stepId: string, position: any) => {
    setElementPositions(prev => ({ ...prev, [stepId]: position }));
  }, []);
  
  // Tutorial element refs
  const headerElement = useTutorialElement('circles-1', handleElementMeasure, []);
  const createButtonElement = useTutorialElement('circles-2', handleElementMeasure, []);
  const discoverButtonElement = useTutorialElement('circles-3', handleElementMeasure, []);
  const friendsTabElement = useTutorialElement('circles-4', handleElementMeasure, []);

  // Refresh chats when the screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadCircles()
      
      // Measure tutorial elements after a delay
      setTimeout(() => {
        headerElement.measure();
        createButtonElement.measure();
        discoverButtonElement.measure();
        friendsTabElement.measure();
      }, 300);
    }, [])
  )
  
  // Start circles tutorial when coming from welcome tutorial
  useEffect(() => {
    if (!loading && !progress.hasSeenCircleChat && Object.keys(elementPositions).length >= 4) {
      // Define circles tutorial steps
      const circlesTutorialSteps = [
        {
          id: 'circles-1',
          title: 'Your Study Circles 📚',
          description: 'This is where all your study groups live! Each circle is a space to complete sprints together and chat with your study buddies.',
          targetElement: elementPositions['circles-1'],
          tooltipPosition: 'bottom' as const,
          highlightColor: '#10B981',
        },
        {
          id: 'circles-2',
          title: 'Create New Circles ➕',
          description: 'Tap here to create your own study circle. You can make it public for anyone to join, or private for just your friends!',
          targetElement: elementPositions['circles-2'],
          tooltipPosition: 'left' as const,
          highlightColor: '#10B981',
        },
        {
          id: 'circles-3',
          title: 'Discover Public Circles 🔍',
          description: 'Find and join public study groups based on your interests. Great for meeting new study partners!',
          targetElement: elementPositions['circles-3'],
          tooltipPosition: 'left' as const,
          highlightColor: '#10B981',
        },
        {
          id: 'circles-4',
          title: 'Find Study Buddies! 👥',
          description: 'Now let\'s find some friends to study with! Tap the Friends tab below to continue.',
          targetElement: elementPositions['circles-4'],
          tooltipPosition: 'top' as const,
          highlightColor: '#10B981',
          requiresInteraction: true,
          onTargetPress: async () => {
            console.log('[Circles Tutorial] Friends tab clicked, completing tutorial...');
            
            // Set completion timestamp before navigation
            try {
              await AsyncStorage.setItem('circleChat_completed_at', Date.now().toString());
            } catch (error) {
              console.error('[Circles Tutorial] Error saving completion timestamp:', error);
            }
            
            // Complete the circles tutorial first
            completeTutorial();
            
            // Then navigate to friends tab after a delay to ensure tutorial context updates
            setTimeout(() => {
              console.log('[Circles Tutorial] Navigating to friends tab...');
              router.push('/(tabs)/friends');
            }, 300); // Increased delay to ensure context updates
          }
        },
      ];
      
      checkAndStartTutorial('circleChat', circlesTutorialSteps);
    }
  }, [loading, progress.hasSeenCircleChat, elementPositions]);

  useEffect(() => {
    let channel: any // RealtimeChannel – keep as any to avoid importing extra type
    let refreshInterval: ReturnType<typeof setInterval>

    const initRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Make sure we start with fresh data
      loadCircles()

      // Set up periodic refresh every 30 seconds as a fallback
      refreshInterval = setInterval(() => {
        // Only update last message times, not reload everything
        updateLastMessageTimes()
      }, 30000)

      channel = supabase
        .channel(`inbox:${user.id}`)
        // Listen for broadcast events when users leave chats
        .on('broadcast', { event: 'user-left-chat' }, (payload) => {
          loadCircles()
        })
        // Someone just added *this* user to a channel (a new chat was created)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'circle_members',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadCircles()
          }
        )
        // Someone removed *this* user from a channel (they left or were removed)
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'circle_members',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadCircles()
          }
        )
        // A brand-new message landed - only update the affected circle
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          async (payload) => {
            const newMessage = payload.new as any
            if (newMessage.circle_id) {
              // Fetch sender info and update the circle
              const { data: senderProfile } = await supabase
                .from('profiles')
                .select('username')
                .eq('user_id', newMessage.sender_id)
                .single()
              
              updateCircleLastMessage(
                newMessage.circle_id, 
                newMessage.created_at,
                newMessage.content,
                senderProfile?.username || 'Unknown',
                !!newMessage.media_url
              )
            }
          }
        )
        // A message was deleted - only update if it affects a circle we're displaying
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'messages',
          },
          async (payload) => {
            const deletedMessage = payload.old as any
            if (deletedMessage.circle_id) {
              // Fetch the new last message for this circle
              const { data } = await supabase
                .from('messages')
                .select('created_at, content, media_url, sender_id')
                .eq('circle_id', deletedMessage.circle_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()
                
              if (data) {
                // Get sender info
                const { data: senderProfile } = await supabase
                  .from('profiles')
                  .select('username')
                  .eq('user_id', data.sender_id)
                  .single()
                  
                updateCircleLastMessage(
                  deletedMessage.circle_id, 
                  data.created_at,
                  data.content,
                  senderProfile?.username || 'Unknown',
                  !!data.media_url
                )
              } else {
                // No messages left in circle
                updateCircleLastMessage(
                  deletedMessage.circle_id, 
                  null,
                  null,
                  null,
                  false
                )
              }
            }
          }
        )
        .subscribe()
    }

    initRealtime()

    return () => {
      if (channel) supabase.removeChannel(channel)
      if (refreshInterval) clearInterval(refreshInterval)
    }
  }, [])

  const updateCircleLastMessage = (
    circleId: string, 
    lastMessageAt: string | null,
    content?: string | null,
    sender?: string | null,
    hasMedia?: boolean
  ) => {
    setCircles(prev => prev.map(circle => 
      circle.id === circleId 
        ? { 
            ...circle, 
            last_message_at: lastMessageAt,
            last_message_content: content !== undefined ? content : circle.last_message_content,
            last_message_sender: sender !== undefined ? sender : circle.last_message_sender,
            last_message_media: hasMedia !== undefined ? hasMedia : circle.last_message_media
          }
        : circle
    ))
  }

  const updateLastMessageTimes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get all circles the user is a member of
      const { data: memberCircles } = await supabase
        .from('circle_members')
        .select('circle_id')
        .eq('user_id', user.id)

      if (!memberCircles || memberCircles.length === 0) return

      const circleIds = memberCircles.map(cm => cm.circle_id)

      // Get last message time for each circle
      const promises = circleIds.map(async (circleId) => {
        const { data } = await supabase
          .from('messages')
          .select('created_at, content, media_url, sender_id')
          .eq('circle_id', circleId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
          
        if (data) {
          // Get sender info
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('username')
            .eq('user_id', data.sender_id)
            .single()
            
          return { 
            circleId, 
            lastMessageAt: data.created_at,
            content: data.content,
            sender: senderProfile?.username || 'Unknown',
            hasMedia: !!data.media_url
          }
        }
        
        return { circleId, lastMessageAt: null, content: null, sender: null, hasMedia: false }
      })

      const results = await Promise.all(promises)
      
      // Update only the last message times
      setCircles(prev => prev.map(circle => {
        const update = results.find(r => r.circleId === circle.id)
        return update ? { 
          ...circle, 
          last_message_at: update.lastMessageAt,
          last_message_content: update.content,
          last_message_sender: update.sender,
          last_message_media: update.hasMedia
        } : circle
      }))
    } catch (error) {
      console.error('Error updating last message times:', error)
    }
  }

  const loadCircles = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_user_circles')

      if (error) {
        console.error('Error loading circles via rpc:', error)
        throw error
      }
      
      setCircles(data as any[] || [])
    } catch (error) {
      console.error('Error loading circles:', error)
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadCircles()
    setRefreshing(false)
  }

  const formatTime = useCallback((timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = diff / (1000 * 60 * 60)
    
    if (hours < 1) {
      return `${Math.floor(diff / (1000 * 60))}m`
    } else if (hours < 24) {
      return `${Math.floor(hours)}h`
    } else {
      return `${Math.floor(hours / 24)}d`
    }
  }, [])

  const handleCirclePress = useCallback((circle: CirclePreview) => {
    router.push(`/(pages)/chat?circleId=${circle.id}`)
  }, [])

  const showCircleOptions = useCallback((circle: CirclePreview) => {
    Alert.alert(
      circle.name,
      'Choose an action',
      [
        {
          text: 'Open Chat',
          onPress: () => router.push(`/(pages)/chat?circleId=${circle.id}`)
        },
        {
          text: 'Circle Settings',
          onPress: () => router.push(`/(pages)/circle-settings?circleId=${circle.id}`)
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  }, [])

  const renderCircleItem = useCallback(({ item }: { item: CirclePreview }) => (
    <MemoizedCircleItem
      item={item}
      onPress={handleCirclePress}
      onLongPress={showCircleOptions}
      formatTime={formatTime}
    />
  ), [handleCirclePress, showCircleOptions, formatTime])

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-black">
        <View className="flex-1 justify-center items-center">
          <GifLoadingIndicator size="large" color="white" />
          <Text className="text-white mt-4">Loading circles...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1">
        {/* Header */}
        <View className="flex-row justify-between items-center p-4 border-b border-gray-800">
          <View ref={headerElement.ref} collapsable={false}>
            <Text className="text-white text-xl font-bold">Circles</Text>
          </View>
          <View className="flex-row items-center gap-4">
            <TouchableOpacity onPress={() => router.push('/(pages)/discover-circles')} ref={discoverButtonElement.ref}>
              <Feather name="search" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(pages)/new-chat')} ref={createButtonElement.ref}>
              <Feather name="plus-circle" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Circle List */}
        {circles.length > 0 ? (
          <CustomPullToRefresh
            onRefresh={onRefresh}
            refreshing={refreshing}
          >
            <FlatList
              data={circles}
              renderItem={renderCircleItem}
              keyExtractor={(item) => item.id}
              className="flex-1"
              removeClippedSubviews={true}
              initialNumToRender={20}
              maxToRenderPerBatch={10}
              windowSize={10}
              updateCellsBatchingPeriod={50}
              maintainVisibleContentPosition={{
                minIndexForVisible: 0
              }}
            />
          </CustomPullToRefresh>
        ) : (
          <View className="flex-1 justify-center items-center p-8">
            <Feather name="message-circle" size={64} color="gray" />
            <Text className="text-gray-400 text-lg mt-4 text-center">
              No circles yet
            </Text>
            <Text className="text-gray-500 text-sm mt-2 text-center">
              Start a conversation with your friends or discover public circles
            </Text>
            <View className="flex-row gap-4 mt-6">
              <TouchableOpacity 
                onPress={() => router.push('/(pages)/new-chat')}
                className="bg-blue-500 px-6 py-3 rounded-full"
              >
                <Text className="text-white font-semibold">Create Circle</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => router.push('/(pages)/discover-circles')}
                className="bg-green-500 px-6 py-3 rounded-full"
              >
                <Text className="text-white font-semibold">Discover</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
      
      {/* Friends tab reference - positioned at bottom for tutorial */}
      <View 
        style={{ 
          position: 'absolute', 
          bottom: 34, // Raised a little higher to align with icon
          left: (screenWidth * 0.125) - 22, // First tab position minus half icon width
          width: 44, // Icon size plus padding
          height: 44, // Icon size plus padding
          pointerEvents: 'none' 
        }} 
        ref={friendsTabElement.ref}
        collapsable={false}
      />
    </SafeAreaView>
  )
}
