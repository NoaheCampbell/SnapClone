import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// Function to generate quiz for sprint
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

export default function CreateSprintPage() {
  const router = useRouter();
  const { circleId } = useLocalSearchParams<{ circleId: string }>();
  const { user } = useAuth();
  
  const [topic, setTopic] = useState('');
  const [goals, setGoals] = useState(['']);
  const [duration, setDuration] = useState('25');
  const [questionCount, setQuestionCount] = useState('3');
  const [creating, setCreating] = useState(false);

  const addGoal = () => {
    if (goals.length < 5) {
      setGoals([...goals, '']);
    }
  };

  const removeGoal = (index: number) => {
    if (goals.length > 1) {
      setGoals(goals.filter((_, i) => i !== index));
    }
  };

  const updateGoal = (index: number, text: string) => {
    const newGoals = [...goals];
    newGoals[index] = text;
    setGoals(newGoals);
  };

  const handleCreateSprint = async () => {
    if (!topic.trim() || !duration || !questionCount) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    const filteredGoals = goals.filter(g => g.trim()).slice(0, 3);
    if (filteredGoals.length === 0) {
      Alert.alert('Missing Goals', 'Please add at least one goal');
      return;
    }

    setCreating(true);

    try {
      const durationMinutes = parseInt(duration);
      const endsAt = new Date();
      endsAt.setMinutes(endsAt.getMinutes() + durationMinutes);

      const { data: sprint, error } = await supabase
        .from('sprints')
        .insert({
          circle_id: circleId,
          user_id: user?.id,
          topic: topic.trim(),
          goals: filteredGoals.join(', '),
          quiz_question_count: parseInt(questionCount),
          ends_at: endsAt.toISOString(),
          tags: []
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator as participant
      await supabase
        .from('sprint_participants')
        .upsert({ sprint_id: sprint.id, user_id: user?.id }, { onConflict: 'sprint_id,user_id', ignoreDuplicates: true });

      // Create sprint announcement message in the circle
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user?.id)
        .single();

      const username = profile?.username || 'Someone';
      
      // Create the initial sprint message (which will be the thread root)
      const { data: newMessage, error: messageError } = await supabase
        .from('messages')
        .insert({
          circle_id: circleId,
          sender_id: user?.id,
          sprint_id: sprint.id,
          content: `🏃‍♀️ ${username} started a ${durationMinutes}-minute sprint: "${topic.trim()}"`,
          join_count: 1
        })
        .select()
        .single();

      if (messageError) {
        console.error('Error sending sprint notification:', messageError);
      } else if (newMessage) {
        // Set thread_root_id to itself to mark it as a root message
        await supabase
          .from('messages')
          .update({ thread_root_id: newMessage.id })
          .eq('id', newMessage.id);
      }

      // Generate quiz for the sprint
      await generateQuizForSprint(sprint.id, topic, filteredGoals.join(', '), parseInt(questionCount));

      // Navigate to sprint camera
      router.replace(`/(pages)/sprint-camera?sprintId=${sprint.id}&isNewSprint=true`);
    } catch (error) {
      console.error('Error creating sprint:', error);
      Alert.alert('Error', 'Failed to create sprint');
      setCreating(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between p-4 border-b border-gray-800">
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="x" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-lg font-semibold">Create Sprint</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView className="flex-1 p-4">
          {/* Topic */}
          <View className="mb-6">
            <Text className="text-white text-sm font-medium mb-2">
              What are you studying? <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g., Spanish Vocabulary"
              placeholderTextColor="#6B7280"
              className="bg-gray-900 text-white p-4 rounded-xl"
              autoFocus
            />
          </View>

          {/* Goals */}
          <View className="mb-6">
            <Text className="text-white text-sm font-medium mb-2">
              Goals (1-3 specific objectives) <Text className="text-red-500">*</Text>
            </Text>
            {goals.map((goal, index) => (
              <View key={index} className="flex-row items-center mb-2">
                <TextInput
                  value={goal}
                  onChangeText={(text) => updateGoal(index, text)}
                  placeholder={`Goal ${index + 1}`}
                  placeholderTextColor="#6B7280"
                  className="flex-1 bg-gray-900 text-white p-3 rounded-xl"
                />
                {goals.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeGoal(index)}
                    className="ml-2 p-2"
                  >
                    <Feather name="minus-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {goals.length < 3 && (
              <TouchableOpacity
                onPress={addGoal}
                className="flex-row items-center mt-2"
              >
                <Feather name="plus-circle" size={20} color="#3B82F6" />
                <Text className="text-blue-500 ml-2">Add Goal</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Duration */}
          <View className="mb-6">
            <Text className="text-white text-sm font-medium mb-2">
              Sprint Duration <Text className="text-red-500">*</Text>
            </Text>
            <View className="flex-row">
              {['15', '25', '45', '60'].map((min) => (
                <TouchableOpacity
                  key={min}
                  onPress={() => setDuration(min)}
                  className={`flex-1 py-3 rounded-xl mr-2 ${
                    duration === min ? 'bg-blue-600' : 'bg-gray-900'
                  }`}
                >
                  <Text className={`text-center ${
                    duration === min ? 'text-white font-semibold' : 'text-gray-400'
                  }`}>
                    {min} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Quiz Questions */}
          <View className="mb-8">
            <Text className="text-white text-sm font-medium mb-2">
              Number of Quiz Questions <Text className="text-red-500">*</Text>
            </Text>
            <View className="flex-row">
              {['3', '5', '10'].map((num) => (
                <TouchableOpacity
                  key={num}
                  onPress={() => setQuestionCount(num)}
                  className={`flex-1 py-3 rounded-xl mr-2 ${
                    questionCount === num ? 'bg-blue-600' : 'bg-gray-900'
                  }`}
                >
                  <Text className={`text-center ${
                    questionCount === num ? 'text-white font-semibold' : 'text-gray-400'
                  }`}>
                    {num} questions
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Create Button */}
          <TouchableOpacity
            onPress={handleCreateSprint}
            disabled={!topic.trim() || creating}
            className={`py-4 rounded-xl items-center ${
              topic.trim() && !creating ? 'bg-blue-600' : 'bg-gray-800'
            }`}
          >
            <Text className="text-white font-semibold text-lg">
              {creating ? 'Creating...' : 'Start Sprint'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
} 