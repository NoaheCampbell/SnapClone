import React from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  Modal 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

interface SprintCompletionModalProps {
  visible: boolean;
  sprintTopic: string;
  sprintDuration: number; // in minutes
  onTakeQuiz: () => void;
}

export default function SprintCompletionModal({ 
  visible, 
  sprintTopic, 
  sprintDuration, 
  onTakeQuiz 
}: SprintCompletionModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <SafeAreaView className="flex-1 bg-black">
        <View className="flex-1 justify-center items-center p-6">
          {/* Success Icon */}
          <View className="bg-green-500/20 rounded-full p-6 mb-6">
            <Feather name="check-circle" size={64} color="#10B981" />
          </View>
          
          {/* Congratulations Message */}
          <Text className="text-white text-3xl font-bold text-center mb-2">
            Sprint Complete!
          </Text>
          
          <Text className="text-gray-400 text-lg text-center mb-2">
            Great job on your {sprintDuration}-minute
          </Text>
          
          <Text className="text-white text-xl font-semibold text-center mb-8">
            "{sprintTopic}" sprint
          </Text>
          
          {/* Motivational Message */}
          <Text className="text-gray-300 text-base text-center mb-8 leading-6">
            Time to test your knowledge! Take a quick quiz to reinforce what you've learned.
          </Text>
          
          {/* Take Quiz Button */}
          <TouchableOpacity
            onPress={onTakeQuiz}
            className="bg-blue-500 px-8 py-4 rounded-lg flex-row items-center"
          >
            <Feather name="help-circle" size={20} color="white" />
            <Text className="text-white text-lg font-semibold ml-2">Take Quiz</Text>
          </TouchableOpacity>
          
          {/* Info Text */}
          <Text className="text-gray-500 text-sm text-center mt-6">
            The quiz will help consolidate your learning
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
} 