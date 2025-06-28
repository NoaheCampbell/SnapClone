import React from 'react';
import { View, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import SprintCamera from '../../components/SprintCamera';
import { supabase } from '../../../lib/supabase';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

export default function SprintCameraPage() {
  const router = useRouter();
  const { sprintId, isNewSprint } = useLocalSearchParams<{ sprintId: string; isNewSprint?: string }>();

  const uploadSprintPhoto = async (photoUri: string, sprintId: string) => {
    try {
      const ext = 'jpg'; // Sprint photos are always JPG from camera
      const path = `sprints/${sprintId}/${Date.now()}.${ext}`;

      // Read file as base64 and convert to ArrayBuffer
      const base64 = await FileSystem.readAsStringAsync(photoUri, {
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
      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading sprint photo:', error);
      throw error;
    }
  };

  const handleCapture = async (photoUrl: string) => {
    try {
      // Upload photo to Supabase storage
      const publicPhotoUrl = await uploadSprintPhoto(photoUrl, sprintId);

      // Update sprint with the uploaded photo URL
      const { error: updateError } = await supabase
        .from('sprints')
        .update({ media_url: publicPhotoUrl })
        .eq('id', sprintId);

      if (updateError) throw updateError;

      // Update the sprint message with the photo
      const { data: messages } = await supabase
        .from('messages')
        .select('id, thread_root_id')
        .eq('sprint_id', sprintId);

      if (messages && messages.length > 0) {
        // Find the root message (where thread_root_id equals id)
        const rootMessage = messages.find(m => m.thread_root_id === m.id);
        if (rootMessage) {
          await supabase
            .from('messages')
            .update({ media_url: publicPhotoUrl })
            .eq('id', rootMessage.id);
        }
      }

      // Navigate back to sprints tab after capture
      router.replace({
        pathname: '/(tabs)/sprints',
        params: { viewSprint: sprintId }
      });
    } catch (error) {
      console.error('Error handling sprint photo:', error);
      Alert.alert('Error', 'Failed to save sprint photo. Please try again.');
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <View style={{ flex: 1 }}>
      <SprintCamera
        onCapture={handleCapture}
        onCancel={handleCancel}
      />
    </View>
  );
} 