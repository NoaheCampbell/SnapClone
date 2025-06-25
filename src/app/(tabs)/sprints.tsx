import { useEffect, useState, useCallback } from 'react';
import { FlatList, Pressable, View, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

interface Sprint {
  id: string;
  circle_id: string;
  user_id: string;
  topic: string;
  tags: string[];
  started_at: string;
  ends_at: string;
  media_url?: string;
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
  const [activeSprints, setActiveSprints] = useState<Sprint[]>([]);
  const [myCircles, setMyCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Load active sprints from user's circles
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
          circles!inner(name),
          profiles!inner(username)
        `)
        .gt('ends_at', new Date().toISOString())
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
          tags: sprint.tags || [],
          started_at: sprint.started_at,
          ends_at: sprint.ends_at,
          media_url: sprint.media_url,
          circle_name: sprint.circles.name,
          username: sprint.profiles.username,
          is_active: timeRemaining > 0,
          time_remaining: timeRemaining
        };
      });

      setActiveSprints(processedSprints);

      // Load user's circles with stats
      const { data: circles, error: circlesError } = await supabase
        .rpc('get_user_circles');

      if (circlesError) throw circlesError;

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

  const endSprint = async (sprintId: string, topic: string) => {
    Alert.alert(
      'End Sprint',
      `Are you sure you want to end your "${topic}" sprint early?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End Sprint', 
          style: 'destructive',
          onPress: async () => {
            try {
              // Update sprint to end now
              const { error } = await supabase
                .from('sprints')
                .update({ ends_at: new Date().toISOString() })
                .eq('id', sprintId);

              if (error) throw error;

              Alert.alert('Sprint Ended', 'Your sprint has been completed!');
              loadData(); // Refresh the data
            } catch (error) {
              console.error('Error ending sprint:', error);
              Alert.alert('Error', 'Failed to end sprint. Please try again.');
            }
          }
        }
      ]
    );
  };

  const startSprint = async (circleId: string) => {
    Alert.prompt(
      'Start Sprint',
      'What are you studying?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Start', 
          onPress: async (topic) => {
            if (!topic?.trim()) return;
            
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;

              // Create sprint directly in database
              const sprintMinutes = 25;
              const endsAt = new Date(Date.now() + sprintMinutes * 60 * 1000);

              const { data: sprint, error: sprintError } = await supabase
                .from('sprints')
                .insert({
                  circle_id: circleId,
                  user_id: user.id,
                  topic: topic.trim(),
                  tags: [],
                  ends_at: endsAt.toISOString()
                })
                .select()
                .single();

              if (sprintError) throw sprintError;

              Alert.alert('Sprint Started!', `Your ${topic} sprint has begun. Good luck!`);
              loadData(); // Refresh the data
            } catch (error) {
              console.error('Error starting sprint:', error);
              Alert.alert('Error', 'Failed to start sprint. Please try again.');
            }
          }
        }
      ],
      'plain-text'
    );
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

  const renderSprint = ({ item }: { item: Sprint }) => {
    const isMySprintAndActive = item.user_id === user?.id && item.is_active;
    
    return (
      <View className="bg-gray-900 rounded-lg p-4 mb-3 mx-4">
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-1">
            <Text className="text-white font-semibold text-lg">{item.topic}</Text>
            <Text className="text-gray-400 text-sm">{item.username} • {item.circle_name}</Text>
          </View>
          {item.is_active && item.time_remaining && (
            <View className="bg-blue-500 rounded-full px-3 py-1">
              <Text className="text-white font-mono text-sm">
                {formatTimeRemaining(item.time_remaining)}
              </Text>
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
            {isMySprintAndActive && (
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
  };

  const renderCircle = ({ item }: { item: Circle }) => (
    <TouchableOpacity 
      onPress={() => startSprint(item.id)}
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
            <Text className="text-white text-lg font-semibold">Active Sprints</Text>
          </View>
          
          {activeSprints.length > 0 ? (
            <FlatList
              data={activeSprints}
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
                No active sprints
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
    </SafeAreaView>
  );
} 