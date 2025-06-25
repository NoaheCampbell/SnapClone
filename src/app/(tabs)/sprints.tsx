import { useEffect, useState, useCallback, useMemo, useRef, memo } from 'react';
import { FlatList, Pressable, View, Text, ActivityIndicator, TouchableOpacity, Alert, TextInput, Modal, Image, Animated } from 'react-native';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import SprintCamera from '../../components/SprintCamera';
import QuizModal from '../../components/QuizModal';
import SprintCompletionModal from '../../components/SprintCompletionModal';

interface Sprint {
  id: string;
  circle_id: string;
  user_id: string;
  topic: string;
  goals?: string;
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
}

export default function SprintsTab() {
  const { user } = useAuth();
  const [recentSprints, setRecentSprints] = useState<Sprint[]>([]);
  const [myCircles, setMyCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [selectedCircleId, setSelectedCircleId] = useState<string>('');
  const [sprintTopic, setSprintTopic] = useState('');
  const [sprintGoals, setSprintGoals] = useState('');
  const [sprintDuration, setSprintDuration] = useState(25);
  const [customDuration, setCustomDuration] = useState('');
  const [creatingSprintLoading, setCreatingSprintLoading] = useState(false);
  const [showStartCamera, setShowStartCamera] = useState(false);
  const [showEndCamera, setShowEndCamera] = useState(false);
  const [startPhotoUrl, setStartPhotoUrl] = useState<string>('');
  const [endingSprintId, setEndingSprintId] = useState<string>('');
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizSprintId, setQuizSprintId] = useState<string>('');
  const [quizSprintTopic, setQuizSprintTopic] = useState<string>('');
  const [quizCircleId, setQuizCircleId] = useState<string>('');
  const [quizSprintDuration, setQuizSprintDuration] = useState<number>(25);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionSprintTopic, setCompletionSprintTopic] = useState<string>('');
  const [completionSprintDuration, setCompletionSprintDuration] = useState<number>(25);

  const loadData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Load recent sprints from user's circles (active + completed in last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: sprints, error: sprintsError } = await supabase
        .from('sprints')
        .select(`
          id,
          circle_id,
          user_id,
          topic,
          tags,
          started_at,
          ends_at,
          media_url,
          end_media_url,
          circles!inner(name),
          profiles!inner(username)
        `)
        .or(`ends_at.gt.${new Date().toISOString()},and(ends_at.lt.${new Date().toISOString()},started_at.gt.${oneDayAgo})`)
        .in('circle_id', 
          await supabase
            .from('circle_members')
            .select('circle_id')
            .eq('user_id', user.id)
            .then(({ data }) => data?.map(m => m.circle_id) || [])
        )
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
          goals: undefined, // Will add back when column exists
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

      console.log('Loaded circles:', circles);

      // Get active sprint counts for each circle
      const circlesWithStats: Circle[] = await Promise.all(
        (circles || []).map(async (circle: any) => {
          const { count } = await supabase
            .from('sprints')
            .select('*', { count: 'exact', head: true })
            .eq('circle_id', circle.id)
            .gt('ends_at', new Date().toISOString());

          return {
            id: circle.id,
            name: circle.name,
            member_count: circle.member_count,
            active_sprints: count || 0
          };
        })
      );

      setMyCircles(circlesWithStats);
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
        .select('circle_id, started_at, ends_at')
        .eq('id', sprintId)
        .single();

      // Update sprint to end now
      const { error } = await supabase
        .from('sprints')
        .update({ ends_at: new Date().toISOString() })
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

      // Show completion modal after sprint ends
      if (sprint) {
        // Calculate sprint duration
        const duration = Math.round((new Date(sprint.ends_at).getTime() - new Date(sprint.started_at).getTime()) / (1000 * 60));
        
        setCompletionSprintTopic(topic);
        setCompletionSprintDuration(duration);
        setQuizSprintId(sprintId);
        setQuizSprintTopic(topic);
        setQuizCircleId(sprint.circle_id);
        setQuizSprintDuration(duration);
        setShowCompletionModal(true);
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

      // Get sprint details first
      const { data: sprint } = await supabase
        .from('sprints')
        .select('circle_id, topic, started_at, ends_at')
        .eq('id', endingSprintId)
        .single();

      // Update sprint to end now and add completion photo
      const { error } = await supabase
        .from('sprints')
        .update({ 
          ends_at: new Date().toISOString(),
          end_media_url: photoUrl
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
      
      // Show completion modal after sprint ends
      if (sprint) {
        // Calculate sprint duration
        const duration = Math.round((new Date(sprint.ends_at).getTime() - new Date(sprint.started_at).getTime()) / (1000 * 60));
        
        setCompletionSprintTopic(sprint.topic || 'Study Sprint');
        setCompletionSprintDuration(duration);
        setQuizSprintId(endingSprintId);
        setQuizSprintTopic(sprint.topic || 'Study Sprint');
        setQuizCircleId(sprint.circle_id);
        setQuizSprintDuration(duration);
        setShowCompletionModal(true);
      }
      
      loadData(); // Refresh the data
    } catch (error) {
      console.error('Error completing sprint:', error);
      Alert.alert('Error', 'Failed to complete sprint. Please try again.');
    }
  };

  const handleStartPhoto = (photoUrl: string) => {
    setStartPhotoUrl(photoUrl);
    setShowStartCamera(false); // Close camera immediately
    // Continue with sprint creation
    createSprintWithPhoto(photoUrl);
  };

  const createSprintWithPhoto = async (photoUrl: string) => {
    if (!sprintTopic.trim() || creatingSprintLoading) return;
    
    // Validate duration
    const duration = parseInt(customDuration);
    if (isNaN(duration) || duration < 1 || duration > 180) {
      Alert.alert('Invalid Duration', 'Please enter a duration between 1 and 180 minutes.');
      return;
    }
    
    try {
      setCreatingSprintLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Create sprint directly in database with photo
      const endsAt = new Date(Date.now() + duration * 60 * 1000);

      const { data: sprint, error: sprintError } = await supabase
        .from('sprints')
        .insert({
          circle_id: selectedCircleId,
          user_id: user.id,
          topic: sprintTopic.trim(),
          tags: [],
          ends_at: endsAt.toISOString(),
          media_url: photoUrl
        })
        .select()
        .single();

      if (sprintError) throw sprintError;

      // Send a system message to the circle about the sprint start
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .single();

      const username = profile?.username || 'Someone';
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          circle_id: selectedCircleId,
          sender_id: user.id,
          content: `🏃‍♀️ ${username} started a ${duration}-minute sprint: "${sprintTopic}"`
        });

      if (messageError) console.error('Error sending sprint notification:', messageError);

      setShowSprintModal(false);
      setStartPhotoUrl('');
      setSprintTopic(''); // Clear form
      setSprintGoals(''); // Clear form
      setCustomDuration('25'); // Reset to default
      Alert.alert('Sprint Started!', `Your ${sprintTopic} sprint has begun. Good luck!`);
      loadData(); // Refresh the data
    } catch (error) {
      console.error('Error starting sprint:', error);
      Alert.alert('Error', 'Failed to start sprint. Please try again.');
    } finally {
      setCreatingSprintLoading(false);
    }
  };

  const openSprintModal = (circleId: string) => {
    setSelectedCircleId(circleId);
    setSprintTopic('');
    setSprintGoals('');
    setSprintDuration(25);
    setCustomDuration('25'); // Default to 25 minutes (standard Pomodoro)
    setShowSprintModal(true);
  };

  const createSprint = async () => {
    if (!sprintTopic.trim() || creatingSprintLoading) return;
    
    // Validate duration
    const duration = parseInt(customDuration);
    if (isNaN(duration) || duration < 1 || duration > 180) {
      Alert.alert('Invalid Duration', 'Please enter a duration between 1 and 180 minutes.');
      return;
    }
    
    // Show camera to take start photo
    setShowSprintModal(false);
    setShowStartCamera(true);
  };

  useEffect(() => {
    loadData();
    
    // Set up real-time updates for sprints
    const subscription = supabase
      .channel('sprints-updates')
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
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [loadData]);



  const SwipeableSprintItem = memo(({ item }: { item: Sprint }) => {
    const isMySprintAndActive = item.user_id === user?.id && item.is_active;
    
    // Calculate if sprint is still active (static check, timer component handles real-time updates)
    const endsAt = new Date(item.ends_at).getTime();
    const isStillActive = endsAt > Date.now();
    const canDelete = !isStillActive; // Only allow deleting completed sprints
    
    const translateX = new Animated.Value(0);
    
    const onGestureEvent = Animated.event(
      [{ nativeEvent: { translationX: translateX } }],
      { useNativeDriver: true }
    );
    
    const onHandlerStateChange = (event: any) => {
      if (event.nativeEvent.state === 5) { // END state
        const { translationX } = event.nativeEvent;
        
        if (canDelete && translationX < -100) {
          // Swipe left far enough to delete
          deleteSprint(item.id, item.topic);
        }
        
        // Reset position
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
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
              <Text className="text-gray-300 text-sm mt-1">Goals: {item.goals}</Text>
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
            <TouchableOpacity 
              onPress={() => router.push(`/(modals)/chat?circleId=${item.circle_id}`)}
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
        >
          <Animated.View style={{ transform: [{ translateX }] }}>
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
      onPress={() => openSprintModal(item.id)}
      className="bg-gray-800 rounded-lg p-4 mb-3 mx-4"
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1">
          <Text className="text-white font-semibold text-lg">{item.name}</Text>
          <Text className="text-gray-400 text-sm">
            {item.member_count} members • {item.active_sprints} active sprints
          </Text>
        </View>
        <View className="flex-row items-center">
          <Feather name="zap" size={20} color="#10B981" />
          <Text className="text-green-400 text-sm ml-1">Start Sprint</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

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
        <ActivityIndicator size="large" color="white" />
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView className="flex-1 bg-black" edges={['top', 'left', 'right']}>
        <View className="flex-1" style={{ paddingBottom: 80 }}>
        {/* Header */}
        <View className="p-4 border-b border-gray-800">
          <Text className="text-white text-2xl font-bold">Study Sprints</Text>
          <Text className="text-gray-400 text-sm">Focus together with your circles</Text>
        </View>

        {/* Active Sprints Section */}
        <View className="flex-1">
          <View className="p-4 pb-2">
            <Text className="text-white text-lg font-semibold">Recent Sprints</Text>
          </View>
          
          {recentSprints.length > 0 ? (
            <FlatList
              data={recentSprints}
              renderItem={renderSprint}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData();
              }}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          ) : (
            <View className="flex-1 justify-center items-center px-8">
              <Feather name="zap" size={64} color="gray" />
              <Text className="text-gray-400 text-lg mt-4 text-center">
                No recent sprints
              </Text>
              <Text className="text-gray-500 text-sm mt-2 text-center">
                Start a sprint in one of your circles below
              </Text>
            </View>
          )}
        </View>

        {/* My Circles Section */}
        <View className="border-t border-gray-800">
          <View className="p-4 pb-2">
            <Text className="text-white text-lg font-semibold">My Circles</Text>
          </View>
          
          <FlatList
            data={myCircles}
            renderItem={renderCircle}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 140 }}
            contentContainerStyle={{ paddingBottom: 10 }}
          />
        </View>
      </View>

      {/* Sprint Creation Modal */}
      <Modal
        visible={showSprintModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView className="flex-1 bg-black">
          <View className="flex-1">
            {/* Header */}
            <View className="flex-row items-center justify-between p-4 border-b border-gray-800">
              <TouchableOpacity onPress={() => {
                setShowSprintModal(false);
                setSprintTopic('');
                setSprintGoals('');
                setCustomDuration('25');
              }}>
                <Text className="text-blue-400 text-lg">Cancel</Text>
              </TouchableOpacity>
              <Text className="text-white text-lg font-semibold">New Sprint</Text>
              <TouchableOpacity 
                onPress={createSprint}
                disabled={!sprintTopic.trim() || creatingSprintLoading || !customDuration || parseInt(customDuration) < 1 || parseInt(customDuration) > 180}
              >
                <Text className={`text-lg font-semibold ${
                  sprintTopic.trim() && !creatingSprintLoading && customDuration && parseInt(customDuration) >= 1 && parseInt(customDuration) <= 180 ? 'text-blue-400' : 'text-gray-600'
                }`}>
                  {creatingSprintLoading ? 'Creating...' : 'Start'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View className="flex-1 p-4">
              {/* Topic */}
              <View className="mb-6">
                <Text className="text-white text-lg font-semibold mb-2">What are you studying?</Text>
                <TextInput
                  value={sprintTopic}
                  onChangeText={setSprintTopic}
                  placeholder="e.g., React Native components"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-800 text-white p-4 rounded-lg text-base"
                  autoFocus
                />
              </View>

              {/* Goals */}
              <View className="mb-6">
                <Text className="text-white text-lg font-semibold mb-2">Goals (optional)</Text>
                <TextInput
                  value={sprintGoals}
                  onChangeText={setSprintGoals}
                  placeholder="e.g., Complete login screen, Fix navigation bug"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-800 text-white p-4 rounded-lg text-base"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Duration */}
              <View className="mb-6">
                <Text className="text-white text-lg font-semibold mb-2">Duration (minutes)</Text>
                <TextInput
                  value={customDuration}
                  onChangeText={(text) => {
                    setCustomDuration(text);
                    const num = parseInt(text);
                    if (!isNaN(num) && num >= 1 && num <= 180) {
                      setSprintDuration(num);
                    }
                  }}
                  placeholder="Enter duration (1-180 minutes)"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-800 text-white p-4 rounded-lg text-base"
                  keyboardType="numeric"
                />
                {customDuration && (
                  <Text className={`text-xs mt-1 ${
                    parseInt(customDuration) >= 1 && parseInt(customDuration) <= 180 
                      ? 'text-gray-400' 
                      : 'text-red-400'
                  }`}>
                    {parseInt(customDuration) >= 1 && parseInt(customDuration) <= 180 
                      ? `Duration: ${parseInt(customDuration)} minutes`
                      : 'Duration must be between 1-180 minutes'
                    }
                  </Text>
                )}
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Sprint Start Camera */}
      {showStartCamera && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
          <SprintCamera
            onCapture={handleStartPhoto}
            onCancel={() => {
              setShowStartCamera(false);
              setShowSprintModal(true); // Go back to sprint modal
            }}
          />
        </View>
      )}

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

      {/* Sprint Completion Modal */}
      <SprintCompletionModal
        visible={showCompletionModal}
        sprintTopic={completionSprintTopic}
        sprintDuration={completionSprintDuration}
        onTakeQuiz={() => {
          setShowCompletionModal(false);
          setShowQuizModal(true);
        }}
      />

      {/* Quiz Modal */}
      <QuizModal
        visible={showQuizModal}
        onClose={() => setShowQuizModal(false)}
        sprintId={quizSprintId}
        sprintTopic={quizSprintTopic}
        circleId={quizCircleId}
        sprintDuration={quizSprintDuration}
      />
    </SafeAreaView>
    </GestureHandlerRootView>
  );
} 