import { View, Text, Image, ActivityIndicator, Pressable, Dimensions } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  const loadStories = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stories')
      .select('id,media_url,media_type,created_at,seen_by')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });
    if (!error && data) setStories(data as any);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  const next = () => {
    if (index + 1 < stories.length) setIndex(index + 1);
    else router.back();
  };

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
        <Text style={{ color: '#fff' }}>No stories</Text>
      </SafeAreaView>
    );
  }

  const { width, height } = Dimensions.get('window');

  return (
    <Pressable style={{ flex: 1, backgroundColor: '#000' }} onPress={next}>
      {story.media_type === 'image' ? (
        <Image source={{ uri: story.media_url }} style={{ width, height }} resizeMode="contain" />
      ) : (
        <Text style={{ color: '#fff', textAlign: 'center', marginTop: 50 }}>Video playback TBD</Text>
      )}
    </Pressable>
  );
} 