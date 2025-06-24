import { useEffect, useState, useCallback } from 'react';
import { FlatList, Image, Pressable, View, Text, ActivityIndicator, useColorScheme } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import Colors from '../../../constants/Colors';
import { SafeAreaView } from 'react-native-safe-area-context';

interface StoryRow {
  id: string;
  user_id: string;
  media_url: string;
  created_at: string;
  seen_by: string[] | null;
  profiles: {
    username: string;
    avatar_url: string | null;
  } | null;
}

interface UserLatestStory {
  user_id: string;
  username: string;
  avatar_url: string | null;
  latest_story_id: string;
  unseen: boolean;
}

export default function StoriesTab() {
  const { user } = useAuth();
  const [items, setItems] = useState<UserLatestStory[]>([]);
  const [loading, setLoading] = useState(true);
  const scheme = useColorScheme() ?? 'light';
  const theme = Colors[scheme];

  const loadStories = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('stories')
      .select('id,user_id,media_url,created_at,seen_by,profiles(username,avatar_url)')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching stories', error);
      setLoading(false);
      return;
    }

    const map = new Map<string, StoryRow>();
    ((data ?? []) as any[]).forEach((raw) => {
      const row = raw as StoryRow;
      if (!map.has(row.user_id)) {
        map.set(row.user_id, row);
      }
    });

    const list: UserLatestStory[] = Array.from(map.values()).map(row => ({
      user_id: row.user_id,
      username: row.profiles?.username ?? 'User',
      avatar_url: row.profiles?.avatar_url ?? null,
      latest_story_id: row.id,
      unseen: !(row.seen_by ?? []).includes(user.id),
    }));

    // Put current user first
    list.sort((a, b) => (a.user_id === user.id ? -1 : b.user_id === user.id ? 1 : 0));

    setItems(list);
    setLoading(false);
  }, [user]);

  // Add new story from gallery (dev helper)
  const addStoryFromGallery = useCallback(async () => {
    if (!user) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.9,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const fileUri = asset.uri;
    const fileExt = fileUri.split('.').pop()?.toLowerCase() || 'jpg';
    const mediaType = asset.type === 'video' ? 'video' : 'image';

    try {
      // Read file data as base64
      const base64 = await fetch(fileUri).then(r => r.arrayBuffer());
      const path = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('stories').upload(path, base64 as any, {
        cacheControl: '3600',
        contentType: asset.mimeType || (mediaType === 'image' ? `image/${fileExt}` : 'video/mp4'),
      });
      if (uploadError && uploadError.message !== 'The resource already exists') {
        console.warn('upload error', uploadError);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl(path);

      const { error: insertErr } = await supabase.from('stories').insert({
        user_id: user.id,
        media_url: publicUrl,
        media_type: mediaType,
      });
      if (insertErr) {
        console.warn('insert error', insertErr);
        return;
      }

      loadStories();
    } catch (e) {
      console.warn('add story error', e);
    }
  }, [user, loadStories]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  if (!user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Please log in</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const renderItem = ({ item }: { item: UserLatestStory }) => (
    <Pressable
      onPress={() => router.push(`/stories/${item.user_id}` as any)}
      style={{ marginHorizontal: 8, alignItems: 'center' }}
    >
      <View
        style={{
          width: 68,
          height: 68,
          borderRadius: 34,
          padding: 3,
          backgroundColor: item.unseen ? theme.tint : theme.tabIconDefault,
        }}
      >
        <Image
          source={ item.avatar_url ? { uri: item.avatar_url } : require('../../../assets/images/avatar-placeholder.png') }
          style={{ width: '100%', height: '100%', borderRadius: 34 }}
          resizeMode="cover"
        />
      </View>
      <Text style={{ marginTop: 4, fontSize: 12, color: theme.text }} numberOfLines={1}>
        {item.user_id === user.id ? 'Your Story' : item.username}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top','left','right']}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.user_id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 32, paddingHorizontal: 8, paddingRight: 120 }}
        renderItem={renderItem}
        refreshing={loading}
        onRefresh={loadStories}
      />

      {/* Floating add button */}
      <Pressable
        onPress={addStoryFromGallery}
        style={{
          position: 'absolute',
          right: 20,
          bottom: 90,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.tint,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 5,
          zIndex: 2,
        }}
      >
        <Text style={{ color: theme.background, fontSize: 32, lineHeight: 32 }}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}
