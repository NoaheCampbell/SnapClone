import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function CreateSprintPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ 
    circleId: string;
    prefillTopic?: string;
    prefillGoals?: string;
    prefillDuration?: string;
    prefillQuestionCount?: string;
  }>();
  
  const [topic, setTopic] = useState(params.prefillTopic || '');
  const [goals, setGoals] = useState(params.prefillGoals ? params.prefillGoals.split(', ').filter(g => g) : ['']);
  const [duration, setDuration] = useState(params.prefillDuration || '25');
  const [questionCount, setQuestionCount] = useState(params.prefillQuestionCount || '3');

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

    // Navigate to camera with all sprint data
    router.replace({
      pathname: '/(pages)/sprint-camera',
      params: {
        circleId: params.circleId,
        topic: topic.trim(),
        goals: filteredGoals.join(', '),
        duration: duration,
        questionCount: questionCount,
        isNewSprint: 'true'
      }
    });
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
            disabled={!topic.trim()}
            className={`py-4 rounded-xl items-center ${
              topic.trim() ? 'bg-blue-600' : 'bg-gray-800'
            }`}
          >
            <Text className="text-white font-semibold text-lg">
              Start Sprint
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
} 