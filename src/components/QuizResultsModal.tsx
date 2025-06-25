import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import Constants from 'expo-constants';

interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
}

interface QuizAttempt {
  id: string;
  score: number;
  answers: number[];
  attempted_at: string;
  improvement_suggestions?: string[];
  quiz: {
    mcq_json: {
      questions: QuizQuestion[];
    };
  };
}

interface QuizResultsModalProps {
  visible: boolean;
  onClose: () => void;
  sprintId: string;
  sprintTopic: string;
}

export default function QuizResultsModal({ visible, onClose, sprintId, sprintTopic }: QuizResultsModalProps) {
  const [quizAttempt, setQuizAttempt] = useState<QuizAttempt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadQuizResults();
    }
  }, [visible, sprintId]);

  const loadQuizResults = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find the quiz attempt for this sprint and user
      const { data: attempt, error } = await supabase
        .from('quiz_attempts')
        .select(`
          id,
          score,
          answers,
          attempted_at,
          improvement_suggestions,
          quizzes!inner(
            mcq_json,
            summaries!inner(
              sprint_id
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('quizzes.summaries.sprint_id', sprintId)
        .single();

      if (error) {
        console.error('Error loading quiz results:', error);
        return;
      }

      const formattedAttempt: QuizAttempt = {
        id: attempt.id,
        score: attempt.score,
        answers: attempt.answers,
        attempted_at: attempt.attempted_at,
        improvement_suggestions: attempt.improvement_suggestions,
        quiz: {
          mcq_json: (attempt as any).quizzes.mcq_json
        }
      };

      setQuizAttempt(formattedAttempt);
    } catch (error) {
      console.error('Error loading quiz results:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setQuizAttempt(null);
    setLoading(true);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View className="flex-1 bg-black" style={{ paddingTop: Constants.statusBarHeight }}>
        <SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']}>
          {/* Header */}
          <View className="flex-row justify-between items-center p-4 border-b border-gray-800" style={{ paddingTop: 16 }}>
            <TouchableOpacity onPress={handleClose}>
              <Feather name="x" size={24} color="white" />
            </TouchableOpacity>
            <Text className="text-white text-xl font-bold">Quiz Results</Text>
            <View style={{ width: 24 }} />
          </View>

          {loading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color="white" />
              <Text className="text-white mt-4">Loading quiz results...</Text>
            </View>
          ) : !quizAttempt ? (
            <View className="flex-1 justify-center items-center p-6">
              <Feather name="help-circle" size={64} color="#6B7280" />
              <Text className="text-white text-2xl font-bold mt-4">No Quiz Found</Text>
              <Text className="text-gray-400 text-lg mt-2 text-center">
                No quiz results found for this sprint. The quiz may not have been completed.
              </Text>
              <TouchableOpacity
                onPress={handleClose}
                className="bg-blue-500 px-6 py-3 rounded-lg mt-6"
              >
                <Text className="text-white font-semibold">Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView className="flex-1 p-4">
              {/* Score Summary */}
              <View className="mb-6 p-6 bg-gray-900 rounded-lg border border-gray-800">
                <Text className="text-white text-2xl font-bold mb-2">{sprintTopic}</Text>
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-gray-400 text-sm">Final Score</Text>
                    <Text className={`text-3xl font-bold ${
                      quizAttempt.score >= 80 ? 'text-green-400' : 
                      quizAttempt.score >= 60 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {quizAttempt.score}%
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-gray-400 text-sm">Completed</Text>
                    <Text className="text-white">
                      {new Date(quizAttempt.attempted_at).toLocaleDateString()}
                    </Text>
                    <Text className="text-gray-400 text-sm">
                      {new Date(quizAttempt.attempted_at).toLocaleTimeString()}
                    </Text>
                  </View>
                </View>
                
                <View className="mt-4 pt-4 border-t border-gray-800">
                  <Text className="text-gray-400 text-sm">Performance</Text>
                  <Text className="text-white">
                    {quizAttempt.quiz.mcq_json.questions.filter((_, index) => 
                      quizAttempt.answers[index] === quizAttempt.quiz.mcq_json.questions[index].correct_answer
                    ).length} out of {quizAttempt.quiz.mcq_json.questions.length} questions correct
                  </Text>
                </View>
              </View>

              {/* Question by Question Results */}
              <Text className="text-white text-xl font-bold mb-4">Detailed Results</Text>
              
              {quizAttempt.quiz.mcq_json.questions.map((question, index) => {
                const userAnswer = quizAttempt.answers[index];
                const correctAnswer = question.correct_answer;
                const isCorrect = userAnswer === correctAnswer;
                const userAnswerText = userAnswer !== -1 ? question.options[userAnswer] : "No answer";
                const correctAnswerText = question.options[correctAnswer];
                
                return (
                  <View key={index} className="mb-6 p-4 bg-gray-900 rounded-lg">
                    <View className="flex-row items-center mb-2">
                      <Feather 
                        name={isCorrect ? "check-circle" : "x-circle"} 
                        size={20} 
                        color={isCorrect ? "#10B981" : "#EF4444"} 
                      />
                      <Text className="text-white font-semibold ml-2">
                        Question {index + 1}
                      </Text>
                    </View>
                    
                    <Text className="text-gray-300 mb-3">{question.question}</Text>
                    
                    <View className="space-y-2">
                      <View className={`p-3 rounded ${isCorrect ? 'bg-green-900/30 border border-green-800' : 'bg-red-900/30 border border-red-800'}`}>
                        <Text className="text-gray-400 text-xs mb-1">Your answer:</Text>
                        <Text className={`${isCorrect ? 'text-green-400' : 'text-red-400'} font-medium`}>
                          {userAnswerText}
                        </Text>
                      </View>
                      
                      {!isCorrect && (
                        <View className="p-3 rounded bg-green-900/30 border border-green-800">
                          <Text className="text-gray-400 text-xs mb-1">Correct answer:</Text>
                          <Text className="text-green-400 font-medium">{correctAnswerText}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* Improvement Suggestions */}
              {quizAttempt.improvement_suggestions && quizAttempt.improvement_suggestions.length > 0 && (
                <View className="mb-6 p-4 bg-blue-900/20 rounded-lg border border-blue-800">
                  <Text className="text-blue-400 text-lg font-semibold mb-3">
                    💡 How to Improve
                  </Text>
                  {quizAttempt.improvement_suggestions.map((suggestion, index) => (
                    <Text key={index} className="text-gray-300 mb-2 leading-5">
                      {suggestion}
                    </Text>
                  ))}
                </View>
              )}

              {/* Bottom spacing */}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
} 