import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import GifLoadingIndicator from '../../components/GifLoadingIndicator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface QuizAttempt {
  id: string;
  score: number;
  answers: number[];
  attempted_at: string;
  quiz: {
    id: string;
    mcq_json: {
      questions: Array<{
        question: string;
        options: string[];
        correct_answer: number;
      }>;
    };
  };
}

export default function QuizResultsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    sprintId: string;
    sprintTopic: string;
    score?: string;
    total?: string;
  }>();

  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAttempt, setSelectedAttempt] = useState<QuizAttempt | null>(null);

  useEffect(() => {
    loadQuizAttempts();
  }, []);

  const loadQuizAttempts = async () => {
    if (!params.sprintId || !user) return;

    try {
      // First get the summary for this sprint
      const { data: summary } = await supabase
        .from('summaries')
        .select('id')
        .eq('sprint_id', params.sprintId)
        .single();

      if (!summary) {
        setLoading(false);
        return;
      }

      // Get quiz for this summary
      const { data: quiz } = await supabase
        .from('quizzes')
        .select('id, mcq_json')
        .eq('summary_id', summary.id)
        .single();

      if (!quiz) {
        setLoading(false);
        return;
      }

      // Get quiz attempts
      const { data: attempts, error } = await supabase
        .from('quiz_attempts')
        .select('id, score, answers, attempted_at')
        .eq('quiz_id', quiz.id)
        .eq('user_id', user.id)
        .order('attempted_at', { ascending: false });

      if (error) {
        console.error('Error loading quiz attempts:', error);
      } else {
        const formattedAttempts: QuizAttempt[] = (attempts || []).map(attempt => ({
          ...attempt,
          quiz: {
            id: quiz.id,
            mcq_json: quiz.mcq_json as { questions: Array<{ question: string; options: string[]; correct_answer: number; }> }
          }
        }));
        
        setQuizAttempts(formattedAttempts);
        if (formattedAttempts.length > 0) {
          setSelectedAttempt(formattedAttempts[0]);
        }
      }
    } catch (error) {
      console.error('Error loading quiz attempts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTryAgain = () => {
    router.back();
  };

  const handleViewConceptMap = () => {
    router.push({
      pathname: '/(pages)/concept-map' as any,
      params: { sprintId: params.sprintId, sprintTopic: params.sprintTopic }
    });
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-black justify-center items-center">
        <GifLoadingIndicator size="large" color="#3B82F6" />
        <Text className="text-gray-400 mt-4">Loading results...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-gray-800">
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold">Quiz Results</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Sprint Info */}
        <View className="mb-6">
          <Text className="text-white text-2xl font-bold">{params.sprintTopic}</Text>
          <Text className="text-gray-400 mt-1">Sprint Quiz Results</Text>
        </View>

        {/* Latest Score (if coming from quiz) */}
        {params.score && params.total && (
          <View className="bg-blue-600/20 border border-blue-600 rounded-xl p-4 mb-6">
            <Text className="text-blue-400 text-sm font-semibold mb-2">Latest Score</Text>
            <Text className="text-white text-3xl font-bold">
              {params.score}/{params.total}
            </Text>
            <Text className="text-gray-300 mt-1">
              {((parseInt(params.score) / parseInt(params.total)) * 100).toFixed(0)}% Correct
            </Text>
          </View>
        )}

        {/* All Attempts */}
        {quizAttempts.length > 0 ? (
          <>
            <Text className="text-white text-lg font-semibold mb-4">All Attempts</Text>
            {quizAttempts.map((attempt, index) => (
              <TouchableOpacity
                key={attempt.id}
                onPress={() => setSelectedAttempt(attempt)}
                className={`mb-3 p-4 rounded-xl ${
                  selectedAttempt?.id === attempt.id
                    ? 'bg-gray-800 border-2 border-blue-600'
                    : 'bg-gray-900'
                }`}
              >
                <View className="flex-row justify-between items-center">
                  <View>
                    <Text className="text-white font-semibold">
                      Attempt {quizAttempts.length - index}
                    </Text>
                    <Text className="text-gray-400 text-sm">
                      {new Date(attempt.attempted_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-white text-lg font-bold">
                      {attempt.score}/{attempt.quiz.mcq_json.questions.length}
                    </Text>
                    <Text className="text-gray-400 text-sm">
                      {((attempt.score / attempt.quiz.mcq_json.questions.length) * 100).toFixed(0)}%
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {/* Question Details */}
            {selectedAttempt && (
              <View className="mt-6">
                <Text className="text-white text-lg font-semibold mb-4">Question Review</Text>
                {selectedAttempt.quiz.mcq_json.questions.map((question, index) => {
                  const userAnswer = selectedAttempt.answers[index];
                  const isCorrect = userAnswer === question.correct_answer;
                  
                  return (
                    <View key={index} className="mb-6 bg-gray-900 rounded-xl p-4">
                      <View className="flex-row items-start mb-3">
                        <View className={`w-6 h-6 rounded-full items-center justify-center mr-3 ${
                          isCorrect ? 'bg-green-600' : 'bg-red-600'
                        }`}>
                          <Feather 
                            name={isCorrect ? 'check' : 'x'} 
                            size={14} 
                            color="white" 
                          />
                        </View>
                        <Text className="text-gray-300 flex-1">
                          {question.question}
                        </Text>
                      </View>
                      
                      <View className="ml-9">
                        {question.options.map((option, optionIndex) => (
                          <Text
                            key={optionIndex}
                            className={`mb-2 ${
                              optionIndex === question.correct_answer
                                ? 'text-green-400'
                                : optionIndex === userAnswer && !isCorrect
                                ? 'text-red-400'
                                : 'text-gray-500'
                            }`}
                          >
                            {optionIndex === question.correct_answer && '✓ '}
                            {optionIndex === userAnswer && !isCorrect && '✗ '}
                            {option}
                          </Text>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : (
          <View className="flex-1 justify-center items-center py-20">
            <Feather name="help-circle" size={64} color="gray" />
            <Text className="text-gray-400 text-lg mt-4">No quiz attempts yet</Text>
            <TouchableOpacity
              onPress={handleTryAgain}
              className="bg-blue-600 rounded-xl px-6 py-3 mt-6"
            >
              <Text className="text-white font-semibold">Take Quiz</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Actions */}
        <View className="mt-8 mb-4">
          <TouchableOpacity
            onPress={handleViewConceptMap}
            className="bg-gray-800 rounded-xl py-4 mb-3"
          >
            <View className="flex-row items-center justify-center">
              <Feather name="map" size={20} color="#10B981" />
              <Text className="text-green-400 font-semibold ml-2">View Concept Map</Text>
            </View>
          </TouchableOpacity>
          
          {quizAttempts.length > 0 && (
            <TouchableOpacity
              onPress={handleTryAgain}
              className="bg-blue-600 rounded-xl py-4"
            >
              <Text className="text-white text-center font-semibold">Try Again</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
