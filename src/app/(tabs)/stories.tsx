import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, FlatList, Image, Dimensions } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Video, ResizeMode } from 'expo-av';

const StoryRing = ({ avatarUrl }: { avatarUrl: string }) => (
  <View className="w-16 h-16 rounded-full border-2 border-indigo-500 justify-center items-center mr-4">
    <Image source={{ uri: avatarUrl }} className="w-14 h-14 rounded-full" />
  </View>
);

export default function StoriesScreen() {
  const [stories, setStories] = useState<any[]>([]);
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    const fetchStories = async () => {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .gt('expires_at', new Date().toISOString());

      if (error) {
        console.error('Error fetching stories:', error);
      } else {
        setStories(data);
      }
    };

    fetchStories();
  }, []);

  return (
    <View className="flex-1 bg-black">
      <ScrollView horizontal className="p-4 flex-grow-0">
        {stories.map(story => (
            <StoryRing key={story.id} avatarUrl={story.user_avatar} />
        ))}
      </ScrollView>
      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        pagingEnabled
        renderItem={({ item }) => (
          <Video
            ref={videoRef}
            source={{ uri: item.video_url }}
            className="w-full h-full"
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height }}
          />
        )}
      />
    </View>
  );
}
