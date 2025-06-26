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
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [score, setScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState<number[]>([]);
  const [improvementSuggestions, setImprovementSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [wrongAnswerAnalysis, setWrongAnswerAnalysis] = useState<string[]>([]);
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

  const analyzeWrongAnswer = async (question: QuizQuestion, userAnswerIndex: number, correctAnswerIndex: number) => {
    try {
      const userAnswer = question.options[userAnswerIndex];
      const correctAnswer = question.options[correctAnswerIndex];
      
      const prompt = `A student studying "${sprintTopic}" just answered this question incorrectly:

Question: ${question.question}
Their answer: ${userAnswer}
Correct answer: ${correctAnswer}

Provide ONE specific, actionable study tip to help them understand this concept better. Keep it concise (1-2 sentences) and avoid using markdown formatting like asterisks or bold text. Start with an emoji.`;

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
              content: 'You are a helpful study coach. Provide specific, actionable study tips without using markdown formatting. Use plain text only with emojis at the start.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 100,
          temperature: 0.7
        })
      });

      if (response.ok) {
        const data = await response.json();
        const tip = data.choices[0].message.content.trim();
        
        // Add this tip to our collection
        setWrongAnswerAnalysis(prev => [...prev, tip]);
      }
    } catch (error) {
      console.error('Error analyzing wrong answer:', error);
    }
  };

  const nextQuestion = async () => {
    if (!quiz) return;
    
    // Check if current answer is wrong and analyze it
    const currentQuestion = quiz.mcq_json.questions[currentQuestionIndex];
    const userAnswer = userAnswers[currentQuestionIndex];
    const correctAnswer = currentQuestion.correct_answer;
    
    if (userAnswer !== correctAnswer && userAnswer !== -1) {
      // Analyze this wrong answer in the background
      analyzeWrongAnswer(currentQuestion, userAnswer, correctAnswer);
    }
    
    if (currentQuestionIndex < quiz.mcq_json.questions.length - 1) {
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

      // Calculate score and store correct answers
      const correctAnswersArray = quiz.mcq_json.questions.map(q => q.correct_answer);
      setCorrectAnswers(correctAnswersArray);
      
      let correctCount = 0;
      quiz.mcq_json.questions.forEach((question, index) => {
        if (userAnswers[index] === question.correct_answer) {
          correctCount++;
        }
      });

      const finalScore = Math.round((correctCount / quiz.mcq_json.questions.length) * 100);
      setScore(finalScore);

      // Generate improvement suggestions
      setLoadingSuggestions(true);
      let finalSuggestions: string[] = [];
      try {
        finalSuggestions = await generateFinalSuggestions(correctCount);
        setImprovementSuggestions(finalSuggestions);
      } catch (error) {
        console.error('Error generating suggestions:', error);
        finalSuggestions = [
          "💡 Here are some general study tips:",
          "• Review the specific topics you found challenging",
          "• Use active recall techniques during your next study session",
          "🚀 Every mistake is a learning opportunity!"
        ];
        setImprovementSuggestions(finalSuggestions);
      } finally {
        setLoadingSuggestions(false);
      }

      // Calculate missed concepts for RAG
      const missedConcepts: string[] = [];
      quiz.mcq_json.questions.forEach((question, index) => {
        if (userAnswers[index] !== question.correct_answer) {
          // Extract key concept from the question
          const concept = question.question.split('?')[0].trim();
          missedConcepts.push(concept);
        }
      });

      // Save quiz attempt with improvement suggestions and missed concepts (only if quiz has a real database ID)
      if (!quiz.id.startsWith('temp_')) {
        const { error } = await supabase
          .from('quiz_attempts')
          .insert({
            quiz_id: quiz.id,
            user_id: user.id,
            score: finalScore,
            answers: userAnswers,
            improvement_suggestions: finalSuggestions,
            missed_concepts: missedConcepts
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

  const generateFinalSuggestions = async (correctCount: number) => {
    if (!quiz) return [];
    
    const totalQuestions = quiz.mcq_json.questions.length;
    const wrongCount = totalQuestions - correctCount;
    
    if (wrongCount === 0) {
      return ["🎉 Perfect score! You've mastered this topic. Keep up the excellent work!"];
    }

    // Combine progressive analysis with a final summary
    const suggestions: string[] = [];
    
    // Add the progressive analysis tips we collected
    if (wrongAnswerAnalysis.length > 0) {
      suggestions.push(`You missed ${wrongCount} out of ${totalQuestions} questions. Here's how to improve:`);
      suggestions.push(...wrongAnswerAnalysis);
    }
    
    // Add general study strategies based on performance
    if (wrongCount > totalQuestions / 2) {
      suggestions.push("💡 Since you missed several questions, consider:");
      suggestions.push(`   • Breaking down ${sprintTopic} into smaller subtopics`);
      suggestions.push("   • Creating flashcards for key concepts you missed");
      suggestions.push("   • Teaching the material to someone else to test your understanding");
    } else {
      suggestions.push("💡 To master the areas you missed:");
      suggestions.push("   • Create summary notes for the specific concepts you got wrong");
      suggestions.push("   • Use the Feynman Technique to explain these topics simply");
    }
    
    suggestions.push("🚀 Remember: Every mistake is a learning opportunity. You're making progress!");
    
    return suggestions;
  };



  const handleClose = () => {
    setQuiz(null);
    setUserAnswers([]);
    setCurrentQuestionIndex(0);
    setShowResults(false);
    setShowDetailedResults(false);
    setScore(0);
    setCorrectAnswers([]);
    setImprovementSuggestions([]);
    setLoadingSuggestions(false);
    setWrongAnswerAnalysis([]);
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
        ) : showDetailedResults ? (
          <ScrollView className="flex-1 p-4">
            <View className="mb-6">
              <Text className="text-white text-2xl font-bold mb-2">Quiz Results</Text>
              <Text className="text-gray-400 text-lg">Your score: {score}%</Text>
            </View>

            {/* Question by Question Results */}
            {quiz && quiz.mcq_json.questions.map((question, index) => {
              const isCorrect = userAnswers[index] === correctAnswers[index];
              const userAnswerText = question.options[userAnswers[index]] || "No answer";
              const correctAnswerText = question.options[correctAnswers[index]];
              
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
                    <View className={`p-2 rounded ${isCorrect ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
                      <Text className="text-gray-400 text-xs">Your answer:</Text>
                      <Text className={`${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                        {userAnswerText}
                      </Text>
                    </View>
                    
                    {!isCorrect && (
                      <View className="p-2 rounded bg-green-900/30">
                        <Text className="text-gray-400 text-xs">Correct answer:</Text>
                        <Text className="text-green-400">{correctAnswerText}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Improvement Suggestions */}
            <View className="mb-6 p-4 bg-blue-900/20 rounded-lg border border-blue-800">
              <Text className="text-blue-400 text-lg font-semibold mb-3">
                💡 How to Improve
              </Text>
              {loadingSuggestions ? (
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color="#60A5FA" />
                  <Text className="text-gray-400 ml-2">Generating personalized tips...</Text>
                </View>
              ) : (
                improvementSuggestions.map((suggestion, index) => (
                  <Text key={index} className="text-gray-300 mb-2">
                    {suggestion}
                  </Text>
                ))
              )}
            </View>

            {/* Action Buttons */}
            <View className="flex-row space-x-3 mb-6">
              <TouchableOpacity
                onPress={() => setShowDetailedResults(false)}
                className="flex-1 bg-gray-700 px-4 py-3 rounded-lg"
              >
                <Text className="text-white font-semibold text-center">Back to Summary</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleClose}
                className="flex-1 bg-green-500 px-4 py-3 rounded-lg"
              >
                <Text className="text-white font-semibold text-center">Continue</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
            
            <View className="flex-row space-x-3 mt-6">
              <TouchableOpacity
                onPress={() => setShowDetailedResults(true)}
                className="bg-blue-500 px-4 py-3 rounded-lg"
              >
                <Text className="text-white font-semibold">View Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleClose}
                className="bg-green-500 px-4 py-3 rounded-lg"
              >
                <Text className="text-white font-semibold">Continue</Text>
              </TouchableOpacity>
            </View>
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