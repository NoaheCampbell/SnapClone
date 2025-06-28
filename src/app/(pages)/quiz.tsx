import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Question {
  question: string;
  options: string[];
  correct_answer: number;
}

export default function QuizScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    sprintId: string;
    sprintTopic: string;
    sprintGoals: string;
    circleId: string;
    sprintDuration: string;
    questionCount: string;
  }>();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const loadQuiz = useCallback(async () => {
    if (!params.sprintId) return;

    try {
      // Get quiz for this sprint
      const { data: quiz, error } = await supabase
        .from('quizzes')
        .select('id, mcq_json')
        .eq('summary_id', 
          await supabase
            .from('summaries')
            .select('id')
            .eq('sprint_id', params.sprintId)
            .single()
            .then(res => res.data?.id)
        )
        .single();

      if (error || !quiz) {
        Alert.alert('No Quiz Available', 'Quiz questions are still being generated. Please try again in a moment.');
        router.back();
        return;
      }

      const quizData = quiz.mcq_json as { questions: Question[] };
      setQuestions(quizData.questions || []);
    } catch (error) {
      console.error('Error loading quiz:', error);
      Alert.alert('Error', 'Failed to load quiz. Please try again.');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [params.sprintId, router]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  const handleSelectOption = (optionIndex: number) => {
    setSelectedOption(optionIndex);
  };

  const handleNext = () => {
    if (selectedOption === null) {
      Alert.alert('Please select an answer');
      return;
    }

    const newAnswers = [...selectedAnswers, selectedOption];
    setSelectedAnswers(newAnswers);

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedOption(null);
    } else {
      // Calculate score
      const finalScore = newAnswers.reduce((acc, answer, index) => {
        return acc + (answer === questions[index].correct_answer ? 1 : 0);
      }, 0);
      setScore(finalScore);
      setShowResult(true);
    }
  };

  const handleFinish = async () => {
    // Save quiz attempt
    try {
      const { data: summary } = await supabase
        .from('summaries')
        .select('id')
        .eq('sprint_id', params.sprintId)
        .single();

      if (summary) {
        const { data: quiz } = await supabase
          .from('quizzes')
          .select('id')
          .eq('summary_id', summary.id)
          .single();

        if (quiz && user) {
          await supabase
            .from('quiz_attempts')
            .insert({
              quiz_id: quiz.id,
              user_id: user.id,
              score,
              answers: selectedAnswers
            });
        }
      }
    } catch (error) {
      console.error('Error saving quiz attempt:', error);
    }

    // Navigate to quiz results
    router.replace({
      pathname: '/(pages)/quiz-results' as any,
      params: {
        sprintId: params.sprintId,
        sprintTopic: params.sprintTopic,
        score: score.toString(),
        total: questions.length.toString()
      }
    });
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-black justify-center items-center">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="text-gray-400 mt-4">Loading quiz...</Text>
      </SafeAreaView>
    );
  }

  if (showResult) {
    return (
      <SafeAreaView className="flex-1 bg-black">
        <View className="flex-1 justify-center items-center px-8">
          <View className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm">
            <Text className="text-white text-2xl font-bold text-center mb-4">
              Quiz Complete!
            </Text>
            <Text className="text-gray-300 text-lg text-center mb-6">
              You scored {score} out of {questions.length}
            </Text>
            <View className="bg-gray-800 rounded-xl p-4 mb-6">
              <Text className="text-gray-400 text-center">
                {((score / questions.length) * 100).toFixed(0)}% Correct
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleFinish}
              className="bg-blue-600 rounded-xl py-4"
            >
              <Text className="text-white text-center font-semibold">
                View Results
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-gray-800">
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold">Quiz</Text>
        <Text className="text-gray-400">
          {currentQuestionIndex + 1}/{questions.length}
        </Text>
      </View>

      {/* Progress Bar */}
      <View className="h-2 bg-gray-800 mx-4 mt-4 rounded-full overflow-hidden">
        <View
          className="h-full bg-blue-600"
          style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
        />
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Question */}
        <View className="mt-8 mb-8">
          <Text className="text-white text-xl font-semibold">
            {currentQuestion?.question}
          </Text>
        </View>

        {/* Options */}
        <View className="space-y-3">
          {currentQuestion?.options.map((option, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleSelectOption(index)}
              className={`p-4 rounded-xl border-2 ${
                selectedOption === index
                  ? 'bg-blue-600/20 border-blue-600'
                  : 'bg-gray-900 border-gray-800'
              }`}
            >
              <Text className={`${
                selectedOption === index ? 'text-blue-400' : 'text-gray-300'
              }`}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Next Button */}
      <View className="p-4">
        <TouchableOpacity
          onPress={handleNext}
          disabled={selectedOption === null}
          className={`py-4 rounded-xl ${
            selectedOption !== null ? 'bg-blue-600' : 'bg-gray-800'
          }`}
        >
          <Text className="text-white text-center font-semibold">
            {currentQuestionIndex < questions.length - 1 ? 'Next' : 'Finish'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
} 