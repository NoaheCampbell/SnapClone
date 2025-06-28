import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function SprintCompletionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sprintId: string;
    sprintTopic: string;
    sprintDuration: string;
  }>();

  const handleViewQuiz = () => {
    // Navigate to quiz page
    router.replace({
      pathname: '/(pages)/quiz' as any,
      params: {
        sprintId: params.sprintId,
        sprintTopic: params.sprintTopic,
        sprintDuration: params.sprintDuration
      }
    });
  };

  const handleDone = () => {
    // Navigate back to sprints tab
    router.replace('/(tabs)/sprints');
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 justify-center items-center px-8">
        <View className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm">
          {/* Success Icon */}
          <View className="w-20 h-20 bg-green-600 rounded-full items-center justify-center mx-auto mb-6">
            <Feather name="check" size={40} color="white" />
          </View>

          {/* Title */}
          <Text className="text-white text-2xl font-bold text-center mb-2">
            Sprint Complete!
          </Text>

          {/* Sprint Info */}
          <Text className="text-gray-300 text-lg text-center mb-6">
            {params.sprintTopic}
          </Text>

          <View className="bg-gray-800 rounded-xl p-4 mb-6">
            <Text className="text-gray-400 text-center">
              Duration: {params.sprintDuration} minutes
            </Text>
          </View>

          {/* Actions */}
          <TouchableOpacity
            onPress={handleViewQuiz}
            className="bg-blue-600 rounded-xl py-4 mb-3"
          >
            <Text className="text-white text-center font-semibold">
              Take Quiz
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDone}
            className="bg-gray-800 rounded-xl py-4"
          >
            <Text className="text-gray-300 text-center font-semibold">
              Done
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
} 