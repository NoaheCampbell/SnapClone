import { View, Text, Image, ActivityIndicator, Pressable, Dimensions, Animated } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface StoryRow {
  id: string;
  media_url: string;
  media_type: string;
  created_at: string;
  seen_by: string[] | null;
}

export default function StoryViewer() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const progress = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<Animated.CompositeAnimation | null>(null);

  const insets = useSafeAreaInsets();

  const loadStories = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stories')
      .select('id,media_url,media_type,created_at,seen_by')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });
    
    if (!error && data) {
      console.log('Loaded stories:', data.length, 'stories for user', userId);
      setStories(data as any);
    } else {
      console.error('Error loading stories:', error);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  const next = useCallback(() => {
    if (timerRef.current) {
      timerRef.current.stop();
      timerRef.current = null;
    }
    if (index + 1 < stories.length) {
      setIndex(index + 1);
    } else {
      router.back();
    }
  }, [index, stories.length]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        timerRef.current.stop();
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!stories[index]) return;
    
    // Stop any existing animation
    if (timerRef.current) {
      timerRef.current.stop();
      timerRef.current = null;
    }
    
    // Reset progress
    progress.setValue(0);
    
    // Start new animation for images
    if (stories[index].media_type === 'image') {
      timerRef.current = Animated.timing(progress, {
        toValue: 1,
        duration: 5000,
        useNativeDriver: false,
      });
      timerRef.current.start(({ finished }) => {
        if (finished) {
          next();
        }
      });
    }
  }, [stories, index, next, progress]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  const story = stories[index];
  if (!story) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
        <Text style={{ color: '#fff' }}>No stories available</Text>
      </SafeAreaView>
    );
  }

  const { width, height } = Dimensions.get('window');

  return (
    <Pressable style={{ flex: 1, backgroundColor: '#000' }} onPress={next}>
      {/* Progress bars */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: insets.top + 6,
          left: 10,
          right: 10,
          flexDirection: 'row',
          gap: 4,
          zIndex: 5,
        }}
      >
        {stories.map((s, i) => {
          const isCompleted = i < index;
          const isCurrent = i === index;
          const isUpcoming = i > index;
          
          return (
            <View
              key={s.id}
              style={{
                flex: 1,
                height: 3,
                backgroundColor: isCompleted 
                  ? '#fff' 
                  : isUpcoming 
                  ? 'rgba(255,255,255,0.3)' 
                  : 'rgba(255,255,255,0.3)',
                borderRadius: 1.5,
                overflow: 'hidden',
              }}
            >
              {isCurrent && (
                <Animated.View
                  style={{ 
                    width: progress.interpolate({ 
                      inputRange: [0, 1], 
                      outputRange: ['0%', '100%'] 
                    }), 
                    height: '100%', 
                    backgroundColor: '#fff',
                    borderRadius: 1.5,
                  }}
                />
              )}
            </View>
          );
        })}
      </View>

      {/* Story content */}
      {story.media_type === 'image' ? (
        <Image 
          source={{ uri: story.media_url }} 
          style={{ width, height }} 
          resizeMode="contain" 
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16 }}>
            Video playback coming soon
          </Text>
        </View>
      )}
    </Pressable>
  );
} 