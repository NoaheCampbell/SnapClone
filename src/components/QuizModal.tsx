import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  Modal, 
  ScrollView, 
  Alert,
  ActivityIndicator,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { supabase } from '../../lib/supabase';

interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
}

interface Quiz {
  id: string;
  mcq_json: {
    questions: QuizQuestion[];
  };
}

interface QuizModalProps {
  visible: boolean;
  onClose: () => void;
  sprintId: string;
  sprintTopic: string;
  sprintGoals: string;
  circleId: string;
  sprintDuration: number; // in minutes
  questionCount?: number; // number of questions to generate
}

export default function QuizModal({ visible, onClose, sprintId, sprintTopic, sprintGoals, circleId, sprintDuration, questionCount = 3 }: QuizModalProps) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [userAnswers, setUserAnswers] = useState<number[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);
  const [hasAlreadyTaken, setHasAlreadyTaken] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [quizTimeLimit, setQuizTimeLimit] = useState(0);

  useEffect(() => {
    if (visible && sprintId) {
      // Calculate quiz time limit (25% of sprint duration, minimum 2 minutes, maximum 10 minutes)
      const calculatedTime = Math.max(2, Math.min(10, Math.floor(sprintDuration * 0.25)));
      setQuizTimeLimit(calculatedTime * 60); // Convert to seconds
      setTimeRemaining(calculatedTime * 60);
      loadQuiz();
    }
  }, [visible, sprintId, sprintDuration]);

  // Quiz timer countdown
  useEffect(() => {
    if (!visible || timeRemaining <= 0 || showResults || hasAlreadyTaken) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Time's up - auto submit quiz
          submitQuiz();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, timeRemaining, showResults, hasAlreadyTaken]);

  const loadQuiz = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // First check if user has already taken this quiz
      const { data: existingAttempt } = await supabase
        .from('quiz_attempts')
        .select('score')
        .eq('quiz_id', sprintId) // For now, using sprintId as quiz lookup
        .eq('user_id', user.id)
        .single();

      if (existingAttempt) {
        setHasAlreadyTaken(true);
        setScore(existingAttempt.score);
        return;
      }

      // Try to find existing quiz for this sprint
      const { data: summary } = await supabase
        .from('summaries')
        .select(`
          id,
          quizzes (
            id,
            mcq_json
          )
        `)
        .eq('sprint_id', sprintId)
        .single();

      if (summary?.quizzes && Array.isArray(summary.quizzes) && summary.quizzes.length > 0) {
        const quiz = summary.quizzes[0] as Quiz;
        setQuiz(quiz);
        setUserAnswers(new Array(quiz.mcq_json.questions.length).fill(-1));
      } else {
        // Quiz might still be generating - show a message
        console.log('Quiz not found for sprint, might still be generating...');
        await generateSampleQuiz();
      }
    } catch (error) {
      console.error('Error loading quiz:', error);
      // Generate sample quiz as fallback
      await generateSampleQuiz();
    } finally {
      setLoading(false);
    }
  };

  const generateQuizWithChatGPT = async (maxRetries = 3) => {
    const prompt = `Generate a quiz with exactly ${questionCount} multiple choice questions based on this study sprint:

Topic: ${sprintTopic}
Goals: ${sprintGoals}

The questions should test understanding of the topic and achievement of the stated goals. Each question should have 4 options with one correct answer.

Return the response in this exact JSON format:
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 0
    }
  ]
}`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`QuizModal: Attempting to generate quiz (attempt ${attempt}/${maxRetries})`);
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that generates educational quiz questions. Always respond with valid JSON only.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 1000,
            temperature: 0.7
          })
        });

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const quizContent = JSON.parse(data.choices[0].message.content);
        
        console.log(`QuizModal: Quiz generation successful on attempt ${attempt}`);
        return quizContent;
      } catch (error) {
        console.error(`QuizModal: Quiz generation attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          console.error('QuizModal: All quiz generation attempts failed');
          return null;
        }
        
        // Exponential backoff: wait 1s, 2s, 4s between retries
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`QuizModal: Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return null;
  };

  const generateSampleQuiz = async () => {
    try {
      // First create a summary for this sprint if it doesn't exist
      const { data: existingSummary } = await supabase
        .from('summaries')
        .select('id')
        .eq('sprint_id', sprintId)
        .single();

      let summaryId = existingSummary?.id;

      if (!summaryId) {
        // Create a summary
        const { data: newSummary, error: summaryError } = await supabase
          .from('summaries')
          .insert({
            sprint_id: sprintId,
            bullets: [`Studied ${sprintTopic}`, "Focused learning session", "Knowledge consolidation"],
            concept_map_url: null
          })
          .select('id')
          .single();

        if (summaryError) throw summaryError;
        summaryId = newSummary.id;
      }

      // Check if quiz already exists for this summary
      const { data: existingQuiz } = await supabase
        .from('quizzes')
        .select('id, mcq_json')
        .eq('summary_id', summaryId)
        .single();

      if (existingQuiz) {
        console.log('Quiz already exists for this summary');
        setQuiz(existingQuiz);
        setUserAnswers(new Array(existingQuiz.mcq_json.questions.length).fill(-1));
        return;
      }

      // Try to generate quiz with ChatGPT first
      let quizData = await generateQuizWithChatGPT();
      
      // Fall back to sample quiz if ChatGPT fails
      if (!quizData) {
        console.log('QuizModal: Falling back to sample quiz due to generation failure');
        quizData = {
          questions: [
            {
              question: `What was the main topic of your "${sprintTopic}" study sprint?`,
              options: [
                sprintTopic,
                "Something else",
                "I don't remember",
                "Multiple topics"
              ],
              correct_answer: 0
            },
            {
              question: `Did you achieve your goal: "${sprintGoals}"?`,
              options: [
                "Yes, completely achieved it",
                "Mostly achieved it",
                "Partially achieved it",
                "No, didn't achieve it"
              ],
              correct_answer: 0
            },
            {
              question: "What's the most important thing you learned during this sprint?",
              options: [
                "New concepts related to the topic",
                "Better study techniques",
                "Time management skills",
                "The importance of focused study time"
              ],
              correct_answer: 0
            },
            {
              question: "Note: We were unable to generate custom quiz questions for your topic, so here are some general study reflection questions instead.",
              options: [
                "I understand - these questions are still helpful",
                "That's okay, I'll take the quiz anyway",
                "No problem, thanks for the fallback questions",
                "I appreciate having something to reflect on"
              ],
              correct_answer: 0
            }
          ]
        };
      }

      // Create the quiz in the database
      const { data: newQuiz, error: quizError } = await supabase
        .from('quizzes')
        .insert({
          summary_id: summaryId,
          mcq_json: quizData
        })
        .select('id, mcq_json')
        .single();

      if (quizError) throw quizError;

      setQuiz(newQuiz);
      setUserAnswers(new Array(quizData.questions.length).fill(-1));
    } catch (error) {
      console.error('Error generating quiz:', error);
      // Fallback to simple quiz without database storage
      const fallbackQuiz = {
        id: `temp_${sprintId}`,
        mcq_json: {
          questions: [
            {
              question: "How did your study sprint go?",
              options: [
                "Very well - I stayed focused",
                "Good - mostly productive",
                "Okay - some distractions",
                "Could have been better"
              ],
              correct_answer: 0
            }
          ]
        }
      };
      setQuiz(fallbackQuiz);
      setUserAnswers([]);
    }
  };

  const selectAnswer = (questionIndex: number, answerIndex: number) => {
    const newAnswers = [...userAnswers];
    newAnswers[questionIndex] = answerIndex;
    setUserAnswers(newAnswers);
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < (quiz?.mcq_json.questions.length || 0) - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const previousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const submitQuiz = async () => {
    if (!quiz) return;
    
    // Check if all questions are answered
    if (userAnswers.includes(-1)) {
      Alert.alert('Incomplete Quiz', 'Please answer all questions before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Calculate score
      let correctAnswers = 0;
      quiz.mcq_json.questions.forEach((question, index) => {
        if (userAnswers[index] === question.correct_answer) {
          correctAnswers++;
        }
      });

      const finalScore = Math.round((correctAnswers / quiz.mcq_json.questions.length) * 100);
      setScore(finalScore);

      // Save quiz attempt (only if quiz has a real database ID)
      if (!quiz.id.startsWith('temp_')) {
        const { error } = await supabase
          .from('quiz_attempts')
          .insert({
            quiz_id: quiz.id,
            user_id: user.id,
            score: finalScore,
            answers: userAnswers
          });

        if (error) throw error;
      }

      // Send notification to circle about quiz completion
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .single();

      const username = profile?.username || 'Someone';
      await supabase
        .from('messages')
        .insert({
          circle_id: circleId,
          sender_id: user.id,
          content: `🧠 ${username} completed the "${sprintTopic}" quiz and scored ${finalScore}%!`
        });

      setShowResults(true);
    } catch (error) {
      console.error('Error submitting quiz:', error);
      Alert.alert('Error', 'Failed to submit quiz. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleClose = () => {
    setQuiz(null);
    setUserAnswers([]);
    setCurrentQuestionIndex(0);
    setShowResults(false);
    setScore(0);
    setHasAlreadyTaken(false);
    setTimeRemaining(0);
    setQuizTimeLimit(0);
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
          <Text className="text-white text-xl font-bold">Sprint Quiz</Text>
          {!showResults && !hasAlreadyTaken && timeRemaining > 0 && (
            <View className={`px-3 py-1 rounded-full ${timeRemaining < 60 ? 'bg-red-500' : timeRemaining < 120 ? 'bg-yellow-500' : 'bg-blue-500'}`}>
              <Text className="text-white font-mono text-sm">
                {formatTime(timeRemaining)}
              </Text>
            </View>
          )}
        </View>

        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="white" />
            <Text className="text-white mt-4">Loading quiz...</Text>
          </View>
        ) : hasAlreadyTaken ? (
          <View className="flex-1 justify-center items-center p-6">
            <Feather name="check-circle" size={64} color="#10B981" />
            <Text className="text-white text-2xl font-bold mt-4">Quiz Already Completed!</Text>
            <Text className="text-gray-400 text-lg mt-2">Your score: {score}%</Text>
            <TouchableOpacity
              onPress={handleClose}
              className="bg-blue-500 px-6 py-3 rounded-lg mt-6"
            >
              <Text className="text-white font-semibold">Close</Text>
            </TouchableOpacity>
          </View>
        ) : showResults ? (
          <View className="flex-1 justify-center items-center p-6">
            <Feather 
              name={score >= 70 ? "award" : "target"} 
              size={64} 
              color={score >= 70 ? "#F59E0B" : "#6B7280"} 
            />
            <Text className="text-white text-2xl font-bold mt-4">Quiz Complete!</Text>
            <Text className="text-gray-400 text-lg mt-2">Your score: {score}%</Text>
            <Text className="text-gray-500 text-sm mt-2 text-center">
              {score >= 70 ? "Great job! You really focused during that sprint." : "Good effort! Every sprint helps you learn and grow."}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              className="bg-green-500 px-6 py-3 rounded-lg mt-6"
            >
              <Text className="text-white font-semibold">Continue</Text>
            </TouchableOpacity>
          </View>
        ) : quiz ? (
          <View className="flex-1">
            {/* Progress */}
            <View className="p-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-gray-400">Question {currentQuestionIndex + 1} of {quiz.mcq_json.questions.length}</Text>
                <Text className="text-gray-400">{sprintTopic}</Text>
              </View>
              <View className="bg-gray-800 h-2 rounded-full">
                <View 
                  className="bg-blue-500 h-2 rounded-full"
                  style={{ width: `${((currentQuestionIndex + 1) / quiz.mcq_json.questions.length) * 100}%` }}
                />
              </View>
            </View>

            {/* Question */}
            <ScrollView className="flex-1 p-4">
              <Text className="text-white text-xl font-semibold mb-6">
                {quiz.mcq_json.questions[currentQuestionIndex].question}
              </Text>

              {/* Answer Options */}
              <View className="space-y-3">
                {quiz.mcq_json.questions[currentQuestionIndex].options.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => selectAnswer(currentQuestionIndex, index)}
                    className={`p-4 rounded-lg border-2 ${
                      userAnswers[currentQuestionIndex] === index
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-gray-600 bg-gray-800'
                    }`}
                  >
                    <Text className="text-white text-base">{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Navigation */}
            <View className="p-4 border-t border-gray-800">
              <View className="flex-row justify-between px-4">
                <TouchableOpacity
                  onPress={previousQuestion}
                  disabled={currentQuestionIndex === 0}
                  className={`px-4 py-2 rounded-lg ${
                    currentQuestionIndex === 0 ? 'bg-gray-700' : 'bg-gray-600'
                  }`}
                >
                  <Text className={`${currentQuestionIndex === 0 ? 'text-gray-500' : 'text-white'}`}>
                    Previous
                  </Text>
                </TouchableOpacity>

                {currentQuestionIndex === quiz.mcq_json.questions.length - 1 ? (
                  <TouchableOpacity
                    onPress={submitQuiz}
                    disabled={submitting || userAnswers[currentQuestionIndex] === -1}
                    className={`px-6 py-2 rounded-lg ${
                      submitting || userAnswers[currentQuestionIndex] === -1 
                        ? 'bg-gray-700' 
                        : 'bg-green-500'
                    }`}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text className="text-white font-semibold">Submit Quiz</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={nextQuestion}
                    disabled={userAnswers[currentQuestionIndex] === -1}
                    className={`px-4 py-2 rounded-lg ${
                      userAnswers[currentQuestionIndex] === -1 ? 'bg-gray-700' : 'bg-blue-500'
                    }`}
                  >
                    <Text className={`${userAnswers[currentQuestionIndex] === -1 ? 'text-gray-500' : 'text-white'}`}>
                      Next
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        ) : (
          <View className="flex-1 justify-center items-center">
            <Text className="text-white">No quiz available</Text>
          </View>
        )}
        </SafeAreaView>
      </View>
    </Modal>
  );
} 