import React, { useEffect, useState, useCallback, useMemo, useRef, memo } from 'react';
import { FlatList, Pressable, View, Text, TouchableOpacity, Alert, TextInput, Image, Animated, StatusBar, TouchableWithoutFeedback, Keyboard, ScrollView, RefreshControl } from 'react-native';
import GifLoadingIndicator from '../../components/GifLoadingIndicator';
import Slider from '@react-native-community/slider';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import SprintCamera from '../../components/SprintCamera';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

interface Sprint {
  id: string;
  circle_id: string;
  user_id: string;
  topic: string;
  goals?: string;
  quiz_question_count?: number;
  tags: string[];
  started_at: string;
  ends_at: string;
  media_url?: string;
  end_media_url?: string;
  circle_name: string;
  username: string;
  is_active: boolean;
  time_remaining?: number;
}

interface Circle {
  id: string;
  name: string;
  member_count: number;
  active_sprints: number;
  current_streak: number;
}

export default function SprintsTab() {
  const { user } = useAuth();
  const [recentSprints, setRecentSprints] = useState<Sprint[]>([]);
  const [myCircles, setMyCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const flatListRef = useRef(null);
  const [showEndCamera, setShowEndCamera] = useState(false);
  const [endingSprintId, setEndingSprintId] = useState<string>('');
  const [userStreak, setUserStreak] = useState<{ current_len: number; freeze_tokens: number }>({ current_len: 0, freeze_tokens: 0 });
  const [activeTab, setActiveTab] = useState<'start' | 'history'>('start');

  const params = useLocalSearchParams<{
    viewSprint?: string;
    copyFrom?: string;
  }>();

  const loadData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Load recent sprints from all circles (the view/RLS will handle access control)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: sprints, error: sprintsError } = await supabase
        .from('sprints')
        .select(`
          id,
          circle_id,
          user_id,
          topic,
          goals,
          quiz_question_count,
          tags,
          started_at,
          ends_at,
          media_url,
          end_media_url,
          circles!inner(name),
          profiles!inner(username)
        `)
        .or(`ends_at.gt.${new Date().toISOString()},and(ends_at.lt.${new Date().toISOString()},started_at.gt.${oneDayAgo})`)
        .order('started_at', { ascending: false });

      if (sprintsError) throw sprintsError;

      // Process sprints data
      const processedSprints: Sprint[] = (sprints || []).map((sprint: any) => {
        const now = new Date();
        const endsAt = new Date(sprint.ends_at);
        const timeRemaining = Math.max(0, endsAt.getTime() - now.getTime());
        
        return {
          id: sprint.id,
          circle_id: sprint.circle_id,
          user_id: sprint.user_id,
          topic: sprint.topic,
          goals: sprint.goals,
          quiz_question_count: sprint.quiz_question_count,
          tags: sprint.tags || [],
          started_at: sprint.started_at,
          ends_at: sprint.ends_at,
          media_url: sprint.media_url,
          end_media_url: sprint.end_media_url,
          circle_name: sprint.circles.name,
          username: sprint.profiles.username,
          is_active: timeRemaining > 0,
          time_remaining: timeRemaining
        };
      });

      setRecentSprints(processedSprints);

      // Load user's circles with stats
      const { data: circles, error: circlesError } = await supabase
        .rpc('get_user_circles');

      if (circlesError) {
        console.error('Error loading circles:', circlesError);
        throw circlesError;
      }

      // Get active sprint counts for each circle
      const circlesWithStats: Circle[] = await Promise.all(
        (circles || []).map(async (circle: any) => {
          const [{ count }, { data: streakRow }] = await Promise.all([
            supabase
              .from('sprints')
              .select('*', { count: 'exact', head: true })
              .eq('circle_id', circle.id)
              .gt('ends_at', new Date().toISOString()),
            supabase
              .from('circles')
              .select('current_streak')
              .eq('id', circle.id)
              .single()
          ]);

          return {
            id: circle.id,
            name: circle.name,
            member_count: circle.member_count,
            active_sprints: count || 0,
            current_streak: streakRow?.current_streak || 0
          };
        })
      );

      setMyCircles(circlesWithStats);

      // Fetch user streak info
      const { data: streakRow } = await supabase
        .from('streaks')
        .select('current_len, freeze_tokens')
        .eq('user_id', user.id)
        .single();
      if (streakRow) {
        setUserStreak({ current_len: streakRow.current_len, freeze_tokens: streakRow.freeze_tokens });
      } else {
        setUserStreak({ current_len: 0, freeze_tokens: 0 });
      }
    } catch (error) {
      console.error('Error loading sprints data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  const formatTimeRemaining = (milliseconds: number) => {
    const minutes = Math.floor(milliseconds / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Separate timer component to prevent parent re-renders
  const SprintTimer = memo(({ endsAt }: { endsAt: string }) => {
    const [timeRemaining, setTimeRemaining] = useState(0);
    
    useEffect(() => {
      const updateTimer = () => {
        const remaining = Math.max(0, new Date(endsAt).getTime() - Date.now());
        setTimeRemaining(remaining);
      };
      
      updateTimer(); // Initial update
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }, [endsAt]);
    
    const isStillActive = timeRemaining > 0;
    
    if (!isStillActive) return null;
    
    return (
      <View className={`rounded-full px-3 py-1 ${timeRemaining < 5 * 60 * 1000 ? 'bg-red-500' : 'bg-blue-500'}`}>
        <Text className="text-white font-mono text-sm">
          {formatTimeRemaining(timeRemaining)}
        </Text>
      </View>
    );
  });

  const deleteSprint = async (sprintId: string, sprintTopic: string) => {
    Alert.alert(
      'Delete Sprint',
      `Are you sure you want to delete the "${sprintTopic}" sprint? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('sprints')
                .delete()
                .eq('id', sprintId);

              if (error) throw error;

              // Refresh the data to remove the deleted sprint from the list
              loadData();
            } catch (error) {
              console.error('Error deleting sprint:', error);
              Alert.alert('Error', 'Failed to delete sprint. Please try again.');
            }
          }
        }
      ]
    );
  };

  const endSprint = async (sprintId: string, topic: string) => {
    Alert.alert(
      'End Sprint',
      `Take a completion photo for your "${topic}" sprint?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Skip Photo', 
          style: 'default',
          onPress: () => completeSprintWithoutPhoto(sprintId, topic)
        },
        { 
          text: 'Take Photo', 
          style: 'default',
          onPress: () => {
            setEndingSprintId(sprintId);
            setShowEndCamera(true);
          }
        }
      ]
    );
  };

  const completeSprintWithoutPhoto = async (sprintId: string, topic: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get sprint details first
      const { data: sprint } = await supabase
        .from('sprints')
        .select('circle_id, goals, quiz_question_count, started_at, ends_at')
        .eq('id', sprintId)
        .single();

      // Update sprint to end now
      const { error } = await supabase
        .from('sprints')
        .update({ ends_at: new Date().toISOString(), stopped_early: true })
        .eq('id', sprintId);

      if (error) throw error;

      // Send a system message about ending the sprint early
      if (sprint?.circle_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('user_id', user.id)
          .single();

        const username = profile?.username || 'Someone';
        const { error: messageError } = await supabase
          .from('messages')
          .insert({
            circle_id: sprint.circle_id,
            sender_id: user.id,
            content: `⏹️ ${username} ended their "${topic}" sprint early`
          });

        if (messageError) console.error('Error sending sprint end notification:', messageError);
      }

      // Navigate to sprint completion page
      if (sprint) {
        const duration = Math.round((new Date(sprint.ends_at).getTime() - new Date(sprint.started_at).getTime()) / (1000 * 60));
        
        router.push({
          pathname: '/(pages)/sprint-completion',
          params: {
            sprintId,
            sprintTopic: topic,
            sprintDuration: duration.toString()
          }
        });
      }
      
      loadData(); // Refresh the data
    } catch (error) {
      console.error('Error ending sprint:', error);
      Alert.alert('Error', 'Failed to end sprint. Please try again.');
    }
  };

  const completeSprintWithPhoto = async (photoUrl: string) => {
    if (!endingSprintId) return;
    
    setShowEndCamera(false); // Close camera immediately
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Upload photo to Supabase storage
      const ext = 'jpg'; // Sprint photos are always JPG from camera
      const path = `sprints/${endingSprintId}/${Date.now()}.${ext}`;

      // Read file as base64 and convert to ArrayBuffer
      const base64 = await FileSystem.readAsStringAsync(photoUrl, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const arrayBuffer = decode(base64);

      const { error: uploadError } = await supabase
        .storage
        .from('chat-media')
        .upload(path, arrayBuffer, {
          contentType: 'image/jpeg'
        });

      if (uploadError) throw uploadError;

      const { data } = await supabase.storage.from('chat-media').getPublicUrl(path);
      const publicPhotoUrl = data.publicUrl;

      // Get sprint details first
      const { data: sprint } = await supabase
        .from('sprints')
        .select('circle_id, topic, goals, quiz_question_count, started_at, ends_at')
        .eq('id', endingSprintId)
        .single();

      // Update sprint to end now and add completion photo
      const { error } = await supabase
        .from('sprints')
        .update({ 
          ends_at: new Date().toISOString(),
          stopped_early: true,
          end_media_url: publicPhotoUrl
        })
        .eq('id', endingSprintId);

      if (error) throw error;

      // Send a system message about ending the sprint with photo
      if (sprint?.circle_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('user_id', user.id)
          .single();

        const username = profile?.username || 'Someone';
        const { error: messageError } = await supabase
          .from('messages')
          .insert({
            circle_id: sprint.circle_id,
            sender_id: user.id,
            content: `🏁 ${username} completed their "${sprint.topic}" sprint!`
          });

        if (messageError) console.error('Error sending sprint completion notification:', messageError);
      }

      setEndingSprintId('');
      
      // Navigate to sprint completion page
      if (sprint) {
        const duration = Math.round((new Date(sprint.ends_at).getTime() - new Date(sprint.started_at).getTime()) / (1000 * 60));
        
        router.push({
          pathname: '/(pages)/sprint-completion',
          params: {
            sprintId: endingSprintId,
            sprintTopic: sprint.topic || 'Study Sprint',
            sprintDuration: duration.toString()
          }
        });
      }
      
      loadData(); // Refresh the data
    } catch (error) {
      console.error('Error completing sprint:', error);
      Alert.alert('Error', 'Failed to complete sprint. Please try again.');
    }
  };

  useEffect(() => {
    loadData();
    
    // Set up real-time updates for sprints, circles, and circle membership
    const subscription = supabase
      .channel('sprints-and-circles-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sprints'
        },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'circle_members'
        },
        (payload) => {
          // Only reload if the change affects the current user
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          if (newRecord?.user_id === user?.id || oldRecord?.user_id === user?.id) {
            loadData();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'circles'
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [loadData]);

  // Effect to react to route params once data is loaded
  useEffect(() => {
    if (!loading && recentSprints.length > 0) {
      if (params.viewSprint) {
        const sprint = recentSprints.find(s => s.id === params.viewSprint);
        if (sprint) {
          // Scroll to sprint or show modal – for now just alert details
          Alert.alert(sprint.topic, `Sprint by ${sprint.username} in ${sprint.circle_name}`);
        }
        // Clear the parameter to prevent re-triggering
        router.setParams({ viewSprint: undefined });
      } else if (params.copyFrom) {
        const sprint = recentSprints.find(s => s.id === params.copyFrom);
        if (sprint) {
          // Navigate to create sprint page with prefilled data
          const duration = Math.round((new Date(sprint.ends_at).getTime() - new Date(sprint.started_at).getTime()) / (1000 * 60));
          router.push({
            pathname: '/(pages)/create-sprint',
            params: {
              circleId: sprint.circle_id,
              prefillTopic: sprint.topic,
              prefillGoals: sprint.goals || '',
              prefillDuration: duration.toString(),
              prefillQuestionCount: (sprint.quiz_question_count || 3).toString()
            }
          });
        }
        // Clear the parameter to prevent re-triggering
        router.setParams({ copyFrom: undefined });
      }
    }
  }, [params, loading, recentSprints]);

  const SwipeableSprintItem = memo(({ item }: { item: Sprint }) => {
    const isMySprintAndActive = item.user_id === user?.id && item.is_active;
    
    // Calculate if sprint is still active (static check, timer component handles real-time updates)
    const endsAt = new Date(item.ends_at).getTime();
    const isStillActive = endsAt > Date.now();
    const canDelete = !isStillActive; // Only allow deleting completed sprints
    
    const translateX = new Animated.Value(0);
    
    // Clamp the translation to prevent excessive movement
    const clampedTranslateX = translateX.interpolate({
      inputRange: [-200, 0],
      outputRange: [-200, 0],
      extrapolate: 'clamp',
    });
    
    const onGestureEvent = Animated.event(
      [{ nativeEvent: { translationX: translateX } }],
      { useNativeDriver: true }
    );
    
    const onHandlerStateChange = (event: any) => {
      if (event.nativeEvent.state === 5) { // END state
        const { translationX, velocityX } = event.nativeEvent;
        
        if (canDelete && translationX < -100 && velocityX < -500) {
          // Swipe left far enough and fast enough to delete
          deleteSprint(item.id, item.topic);
        }
        
        // Reset position
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 40,
          friction: 10,
        }).start();
      }
    };
    
    const SprintContent = () => (
      <View className="bg-gray-900 rounded-lg p-4 mb-3 mx-4">
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-1">
            <Text className="text-white font-semibold text-lg">{item.topic}</Text>
            <Text className="text-gray-400 text-sm">{item.username} • {item.circle_name}</Text>
            {item.goals && (
              <Text className="text-gray-300 text-sm mt-1">
                Goals: {Array.isArray(item.goals) ? item.goals.join(', ') : item.goals}
              </Text>
            )}
          </View>
          
          {/* Sprint Photos */}
          <View className="flex-row space-x-2">
            {item.media_url && (
              <View className="relative">
                <Image 
                  source={{ uri: item.media_url }} 
                  className="w-16 h-16 rounded-lg"
                  resizeMode="cover"
                />
                <View className="absolute bottom-0 left-0 right-0 bg-black/60 rounded-b-lg px-1 py-0.5">
                  <Text className="text-white text-xs text-center">Start</Text>
                </View>
              </View>
            )}
            {item.end_media_url && (
              <View className="relative">
                <Image 
                  source={{ uri: item.end_media_url }} 
                  className="w-16 h-16 rounded-lg"
                  resizeMode="cover"
                />
                <View className="absolute bottom-0 left-0 right-0 bg-black/60 rounded-b-lg px-1 py-0.5">
                  <Text className="text-white text-xs text-center">End</Text>
                </View>
              </View>
            )}
          </View>
          {isStillActive && (
            <SprintTimer endsAt={item.ends_at} />
          )}
          {!isStillActive && item.is_active && (
            <View className="bg-gray-600 rounded-full px-3 py-1 flex-row items-center">
              <Text className="text-white text-sm">Completed</Text>
              {canDelete && (
                <Feather name="chevron-left" size={14} color="white" style={{ marginLeft: 4 }} />
              )}
            </View>
          )}
        </View>
        
        {item.tags.length > 0 && (
          <View className="flex-row flex-wrap mb-2">
            {item.tags.map((tag, index) => (
              <View key={index} className="bg-gray-700 rounded-full px-2 py-1 mr-2 mb-1">
                <Text className="text-gray-300 text-xs">#{tag}</Text>
              </View>
            ))}
          </View>
        )}
        
        <View className="flex-row items-center justify-between">
          <Text className="text-gray-500 text-xs">
            Started {new Date(item.started_at).toLocaleTimeString()}
          </Text>
          <View className="flex-row items-center space-x-3">
            {isMySprintAndActive && isStillActive && (
              <TouchableOpacity 
                onPress={() => endSprint(item.id, item.topic)}
                className="flex-row items-center mr-3"
              >
                <Feather name="square" size={16} color="#EF4444" />
                <Text className="text-red-400 text-sm ml-1">End</Text>
              </TouchableOpacity>
            )}
            {!isStillActive && (
              <>
                <TouchableOpacity 
                  onPress={() => openQuizResults(item.id, item.topic)}
                  className="flex-row items-center mr-3"
                >
                  <Feather name="help-circle" size={16} color="#A78BFA" />
                  <Text className="text-purple-400 text-sm ml-1">Quiz</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => {
                    router.push({
                      pathname: '/(pages)/concept-map' as any,
                      params: { sprintId: item.id, sprintTopic: item.topic }
                    });
                  }}
                  className="flex-row items-center mr-3"
                >
                  <Feather name="map" size={16} color="#10B981" />
                  <Text className="text-green-400 text-sm ml-1">Map</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity 
              onPress={() => joinSprint(item)}
              className="flex-row items-center"
            >
              <Feather name="message-circle" size={16} color="#60A5FA" />
              <Text className="text-blue-400 text-sm ml-1">Join</Text>
            </TouchableOpacity>
          </View>
        </View>
        

      </View>
    );
    
    if (!canDelete) {
      // For active sprints, just return the content without swipe functionality
      return <SprintContent />;
    }
    
    return (
      <View style={{ position: 'relative' }}>
        {/* Delete background */}
        <View className="absolute right-0 top-0 bottom-0 w-20 bg-red-500 rounded-r-lg mb-3 mr-4 flex justify-center items-center">
          <Feather name="trash-2" size={20} color="white" />
        </View>
        
        {/* Swipeable content */}
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
          activeOffsetX={-20}
          failOffsetY={[-10, 10]}
          shouldCancelWhenOutside={true}
          enabled={canDelete}
        >
          <Animated.View style={{ transform: [{ translateX: clampedTranslateX }] }}>
            <SprintContent />
          </Animated.View>
        </PanGestureHandler>
      </View>
    );
  });

  const renderSprint = ({ item }: { item: Sprint }) => (
    <SwipeableSprintItem item={item} />
  );

  const renderCircle = ({ item }: { item: Circle }) => (
    <TouchableOpacity 
      onPress={() => navigateToCreateSprint(item.id)}
      className="bg-gray-800 rounded-xl p-6 mb-4 mx-4 shadow-lg"
      activeOpacity={0.7}
    >
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-1">
          <Text className="text-white font-bold text-xl mb-2">{item.name}</Text>
          <View className="flex-row items-center space-x-4">
            <View className="flex-row items-center bg-gray-700/50 px-3 py-1 rounded-full">
              <Feather name="users" size={14} color="#9CA3AF" />
              <Text className="text-gray-400 text-sm ml-1">{item.member_count} members</Text>
            </View>
            <View className="flex-row items-center bg-gray-700/50 px-3 py-1 rounded-full">
              <Feather name="activity" size={14} color="#10B981" />
              <Text className="text-green-400 text-sm ml-1">{item.active_sprints} active</Text>
            </View>
          </View>
        </View>
        <View className="items-center">
          <View className="bg-green-500/20 rounded-2xl px-6 py-4">
            <Feather name="zap" size={28} color="#10B981" />
          </View>
          <Text className="text-green-400 text-sm font-medium mt-2">Start</Text>
        </View>
      </View>
      {item.current_streak > 0 && (
        <View className="border-t border-gray-700 pt-3">
          <View className="flex-row items-center">
            <Text className="text-gray-500 text-sm">Circle streak: </Text>
            <Text className="text-yellow-400 text-sm font-medium">🔥 {item.current_streak} days</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );

  // Join an existing sprint (increment join counter and optionally track participation)
  const joinSprint = async (sprint: Sprint) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Insert participant row or ignore if already exists
      await supabase
        .from('sprint_participants')
        .upsert({ sprint_id: sprint.id, user_id: user.id }, { onConflict: 'sprint_id,user_id', ignoreDuplicates: true });

      // Fetch username for message content
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .single();

      const username = profile?.username || 'Someone';

      // Handle threading directly - find the root message for this sprint
      const { data: sprintMessages } = await supabase
        .from('messages')
        .select('id, join_count, thread_root_id')
        .eq('circle_id', sprint.circle_id)
        .eq('sprint_id', sprint.id);
      
      // Find the root message (where thread_root_id equals id)
      const rootMessage = sprintMessages?.find(m => m.thread_root_id === m.id);

      if (rootMessage) {
        // Root message exists, create a reply
        const { error: messageError } = await supabase
          .from('messages')
          .insert({
            circle_id: sprint.circle_id,
            sender_id: user.id,
            sprint_id: sprint.id,
            content: `🏃‍♂️ ${username} joined the sprint`,
            thread_root_id: rootMessage.id
          });

        if (!messageError) {
          // Update join count on root message - force updated_at to trigger realtime
          const newJoinCount = (rootMessage.join_count || 1) + 1;
          const { error: updateError } = await supabase
            .from('messages')
            .update({ 
              join_count: newJoinCount,
              updated_at: new Date().toISOString()
            })
            .eq('id', rootMessage.id);
            

        }
      } else {
        // No root message found - this shouldn't normally happen
        console.error('No root message found for sprint:', sprint.id);
      }

      // Navigate to chat
              router.push(`/(pages)/chat?circleId=${sprint.circle_id}`);
    } catch (error) {
      console.error('Error joining sprint:', error);
    }
  };

  const navigateToCreateSprint = (circleId: string) => {
    // Navigate to create sprint page
    router.push(`/(pages)/create-sprint?circleId=${circleId}`);
  };

  const openQuizResults = (sprintId: string, sprintTopic: string) => {
    // Navigate to quiz results page
    router.push({
      pathname: '/(pages)/quiz-results' as any,
      params: { sprintId, sprintTopic }
    });
  };

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-black justify-center items-center" edges={['top', 'left', 'right']}>
        <Text className="text-white">Please log in</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-black justify-center items-center" edges={['top', 'left', 'right']}>
                      <GifLoadingIndicator size="large" color="white" />
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <SafeAreaView className="flex-1 bg-black" edges={['top', 'left', 'right']}>
        <View className="flex-1" style={{ paddingBottom: 80 }}>
        {/* Header */}
        <View className="p-4 border-b border-gray-800">
          <Text className="text-white text-2xl font-bold">Study Sprints</Text>
          <Text className="text-gray-400 text-sm">Focus together with your circles</Text>
          <View className="flex-row items-center mt-1 space-x-4">
            <View className="flex-row items-center">
              <Feather name="zap" size={16} color="#FBBF24" />
              <Text className="text-yellow-400 text-sm ml-1">{userStreak.current_len} day streak</Text>
            </View>
            <View className="flex-row items-center">
              <Feather name="gift" size={16} color="#93C5FD" />
              <Text className="text-blue-300 text-sm ml-1">{userStreak.freeze_tokens} tokens</Text>
            </View>
          </View>
        </View>

        {/* Tab Navigation */}
        <View className="px-4 pb-4">
          <View className="flex-row bg-gray-900 rounded-xl p-1">
            <TouchableOpacity
              onPress={() => setActiveTab('start')}
              className={`flex-1 py-3 px-4 rounded-lg ${
                activeTab === 'start' ? 'bg-green-500' : 'bg-transparent'
              }`}
            >
              <Text className={`text-center font-semibold ${
                activeTab === 'start' ? 'text-white' : 'text-gray-400'
              }`}>
                Start Sprint
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('history')}
              className={`flex-1 py-3 px-4 rounded-lg ${
                activeTab === 'history' ? 'bg-blue-500' : 'bg-transparent'
              }`}
            >
              <Text className={`text-center font-semibold ${
                activeTab === 'history' ? 'text-white' : 'text-gray-400'
              }`}>
                Recent Sprints
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Content Area */}
        {activeTab === 'start' ? (
          /* Start Sprint Tab - My Circles */
          <View className="flex-1">
            <View className="p-4 pb-2">
              <Text className="text-white text-lg font-semibold">Choose a Circle</Text>
              <Text className="text-gray-400 text-sm mt-1">Select where you want to start your sprint</Text>
            </View>
            
            {myCircles.length > 0 ? (
              <FlatList
                data={myCircles}
                renderItem={renderCircle}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
                ListEmptyComponent={
                  <View className="flex-1 items-center justify-center px-8 py-20">
                    <Feather name="users" size={48} color="gray" />
                    <Text className="text-gray-400 text-lg mt-4 text-center">
                      No circles yet
                    </Text>
                    <Text className="text-gray-500 text-sm mt-2 text-center">
                      Join or create a circle to start sprinting
                    </Text>
                  </View>
                }
              />
            ) : (
              <View className="flex-1 items-center justify-center px-8">
                <Feather name="users" size={48} color="gray" />
                <Text className="text-gray-400 text-lg mt-4 text-center">
                  No circles yet
                </Text>
                <Text className="text-gray-500 text-sm mt-2 text-center">
                  Join or create a circle to start sprinting
                </Text>
              </View>
            )}
          </View>
        ) : (
          /* Recent Sprints Tab */
          <View className="flex-1">
            <View className="p-4 pb-2">
              <Text className="text-white text-lg font-semibold">Sprint History</Text>
              <Text className="text-gray-400 text-sm mt-1">Your recent and active sprints</Text>
            </View>
            
            {recentSprints.length > 0 ? (
              <FlatList
                data={recentSprints}
                renderItem={renderSprint}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => {
                      setRefreshing(true);
                      loadData();
                    }}
                    tintColor="#3B82F6"
                    colors={['#3B82F6', '#60A5FA', '#93C5FD']}
                    progressBackgroundColor="#1F2937"
                    title="Pull to refresh sprints"
                    titleColor="#9CA3AF"
                  />
                }
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            ) : (
              <View className="flex-1 justify-center items-center px-8">
                <Feather name="clock" size={48} color="gray" />
                <Text className="text-gray-400 text-lg mt-4 text-center">
                  No recent sprints
                </Text>
                <Text className="text-gray-500 text-sm mt-2 text-center">
                  Start a sprint to see it here
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Sprint End Camera */}
      {showEndCamera && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
          <SprintCamera
            onCapture={completeSprintWithPhoto}
            onCancel={() => {
              setShowEndCamera(false);
              setEndingSprintId('');
            }}
          />
        </View>
      )}
    </SafeAreaView>
    </GestureHandlerRootView>
  );
} 