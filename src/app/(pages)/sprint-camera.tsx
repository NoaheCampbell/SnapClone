import React from 'react';
import { View, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import SprintCamera from '../../components/SprintCamera';
import { supabase } from '../../../lib/supabase';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { useAuth } from '../../contexts/AuthContext';

// Function to generate quiz for sprint (moved from create-sprint.tsx)
const generateQuizForSprint = async (sprintId: string, topic: string, goals: string, questionCount: number) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Generate AI summary with RAG using edge function
    const summaryResponse = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generateSummaryWithRAG`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        sprintId,
        topic,
        goals,
        tags: topic.toLowerCase().split(/\s+/).filter(word => word.length > 2)
      })
    });

    let summary;
    if (summaryResponse.ok) {
      const summaryResult = await summaryResponse.json();
      summary = summaryResult.summary;
    } else {
      // Fallback to simple summary
      const { data: newSummary } = await supabase
        .from('summaries')
        .insert({
          sprint_id: sprintId,
          bullets: [`Study topic: ${topic}`, `Goals: ${goals}`],
          tags: topic.toLowerCase().split(/\s+/).filter(word => word.length > 2)
        })
        .select()
        .single();
      summary = newSummary;
    }

    if (!summary) return;

    // Generate gap-aware quiz using RAG edge function
    const gapAwareQuizResponse = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generateGapAwareQuiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        sprintId,
        topic,
        goals,
        tags: summary.tags || [],
        questionCount,
        userId: user.id
      })
    });

    if (gapAwareQuizResponse.ok) {
      const gapAwareResult = await gapAwareQuizResponse.json();
      const quizContent = gapAwareResult.quiz;
      
      if (quizContent) {
        await supabase
          .from('quizzes')
          .insert({
            summary_id: summary.id,
            mcq_json: quizContent
          });
      }
    }
  } catch (error) {
    console.error('Error generating quiz for sprint:', error);
  }
};

export default function SprintCameraPage() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ 
    sprintId?: string; 
    isNewSprint?: string;
    circleId?: string;
    topic?: string;
    goals?: string;
    duration?: string;
    questionCount?: string;
  }>();

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

  const createSprintInBackground = async (photoUrl: string) => {
    if (!params.circleId || !params.topic || !params.duration || !user) return;

    try {
      // Upload photo first - generate a temporary ID for the photo path
      const tempSprintId = Date.now().toString() + '-' + Math.random().toString(36).substring(2);
      const publicPhotoUrl = await uploadSprintPhoto(photoUrl, tempSprintId);

      // Create sprint with photo URL all at once
      const durationMinutes = parseInt(params.duration);
      const endsAt = new Date();
      endsAt.setMinutes(endsAt.getMinutes() + durationMinutes);

      const { data: sprint, error } = await supabase
        .from('sprints')
        .insert({
          circle_id: params.circleId,
          user_id: user.id,
          topic: params.topic,
          goals: params.goals || '',
          quiz_question_count: parseInt(params.questionCount || '3'),
          ends_at: endsAt.toISOString(),
          tags: [],
          media_url: publicPhotoUrl
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator as participant
      await supabase
        .from('sprint_participants')
        .upsert({ sprint_id: sprint.id, user_id: user.id }, { onConflict: 'sprint_id,user_id', ignoreDuplicates: true });

      // Get username for message
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .single();

      const username = profile?.username || 'Someone';
      
      // Create the initial sprint message with photo
      const { data: newMessage, error: messageError } = await supabase
        .from('messages')
        .insert({
          circle_id: params.circleId,
          sender_id: user.id,
          sprint_id: sprint.id,
          content: `🏃‍♀️ ${username} started a ${durationMinutes}-minute sprint: "${params.topic}"`,
          media_url: publicPhotoUrl,
          join_count: 1
        })
        .select()
        .single();

      if (!messageError && newMessage) {
        // Set thread_root_id to itself to mark it as a root message
        await supabase
          .from('messages')
          .update({ thread_root_id: newMessage.id })
          .eq('id', newMessage.id);
      }

      // Generate quiz in the background (don't await)
      generateQuizForSprint(sprint.id, params.topic, params.goals || '', parseInt(params.questionCount || '3'));

    } catch (error) {
      console.error('Error creating sprint:', error);
      // Show error notification but don't block the user
      Alert.alert('Sprint Creation Failed', 'Your sprint could not be created. Please try again.');
    }
  };

  const updateExistingSprintInBackground = async (photoUrl: string) => {
    if (!params.sprintId) return;

    try {
      // Upload photo to Supabase storage
      const publicPhotoUrl = await uploadSprintPhoto(photoUrl, params.sprintId);

      // Update sprint with the uploaded photo URL
      const { error: updateError } = await supabase
        .from('sprints')
        .update({ media_url: publicPhotoUrl })
        .eq('id', params.sprintId);

      if (updateError) throw updateError;

      // Update the sprint message with the photo
      const { data: messages } = await supabase
        .from('messages')
        .select('id, thread_root_id')
        .eq('sprint_id', params.sprintId);

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
    } catch (error) {
      console.error('Error updating sprint photo:', error);
      Alert.alert('Photo Update Failed', 'Could not save your sprint photo.');
    }
  };

  const handleCapture = async (photoUrl: string) => {
    // Navigate immediately for better UX
    if (params.isNewSprint === 'true') {
      // Navigate to sprints tab
      router.replace('/(tabs)/sprints');
      
      // Create sprint in background (don't await)
      createSprintInBackground(photoUrl);
    } else {
      // Navigate back immediately
      router.replace('/(tabs)/sprints');
      
      // Update in background (don't await)
      updateExistingSprintInBackground(photoUrl);
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