import React, { useEffect, useState, useCallback, useMemo, useRef, memo } from 'react';
import { FlatList, Pressable, View, Text, ActivityIndicator, TouchableOpacity, Alert, TextInput, Modal, Image, Animated, StatusBar, TouchableWithoutFeedback, Keyboard } from 'react-native';
import Slider from '@react-native-community/slider';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import SprintCamera from '../../components/SprintCamera';
import QuizModal from '../../components/QuizModal';
import SprintCompletionModal from '../../components/SprintCompletionModal';
import QuizResultsModal from '../../components/QuizResultsModal';
import ConceptMapModal from '../../components/ConceptMapModal';

interface Sprint {
  id: string;
  circle_id: string;
  user_id: string;
  topic: string;
  goals?: string;
  quiz_question_count?: number;
  tags: string[];
  started_at: string;
  ends_at: string;
  media_url?: string;
  end_media_url?: string;
  circle_name: string;
  username: string;
  is_active: boolean;
  time_remaining?: number;
}

interface Circle {
  id: string;
  name: string;
  member_count: number;
  active_sprints: number;
  current_streak: number;
}

export default function SprintsTab() {
  const { user } = useAuth();
  const [recentSprints, setRecentSprints] = useState<Sprint[]>([]);
  const [myCircles, setMyCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [selectedCircleId, setSelectedCircleId] = useState<string>('');
  const [sprintTopic, setSprintTopic] = useState('');
  const [sprintGoals, setSprintGoals] = useState('');
  const [sprintDuration, setSprintDuration] = useState(25);
  const [customDuration, setCustomDuration] = useState('');
  const [quizQuestionCount, setQuizQuestionCount] = useState(3);
  const [creatingSprintLoading, setCreatingSprintLoading] = useState(false);
  const [showStartCamera, setShowStartCamera] = useState(false);
  const [showEndCamera, setShowEndCamera] = useState(false);
  const [startPhotoUrl, setStartPhotoUrl] = useState<string>('');
  const [endingSprintId, setEndingSprintId] = useState<string>('');
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizSprintId, setQuizSprintId] = useState<string>('');
  const [quizSprintTopic, setQuizSprintTopic] = useState<string>('');
  const [quizSprintGoals, setQuizSprintGoals] = useState<string>('');
  const [quizCircleId, setQuizCircleId] = useState<string>('');
  const [quizSprintDuration, setQuizSprintDuration] = useState<number>(25);
  const [selectedQuizQuestionCount, setSelectedQuizQuestionCount] = useState<number>(3);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionSprintTopic, setCompletionSprintTopic] = useState<string>('');
  const [completionSprintDuration, setCompletionSprintDuration] = useState<number>(25);
  const [showQuizResultsModal, setShowQuizResultsModal] = useState(false);
  const [resultsSprintId, setResultsSprintId] = useState<string>('');
  const [resultsSprintTopic, setResultsSprintTopic] = useState<string>('');

  const [showConceptMapModal, setShowConceptMapModal] = useState(false);
  const [conceptMapSprintId, setConceptMapSprintId] = useState<string>('');
  const [conceptMapSprintTopic, setConceptMapSprintTopic] = useState<string>('');

  const [userStreak, setUserStreak] = useState<{ current_len: number; freeze_tokens: number }>({ current_len: 0, freeze_tokens: 0 });

  const loadData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Load recent sprints from user's circles (active + completed in last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: sprints, error: sprintsError } = await supabase
        .from('sprints')
        .select(`
          id,
          circle_id,
          user_id,
          topic,
          goals,
          quiz_question_count,
          tags,
          started_at,
          ends_at,
          media_url,
          end_media_url,
          circles!inner(name),
          profiles!inner(username)
        `)
        .or(`ends_at.gt.${new Date().toISOString()},and(ends_at.lt.${new Date().toISOString()},started_at.gt.${oneDayAgo})`)
        .in('circle_id', 
          await supabase
            .from('circle_members')
            .select('circle_id')
            .eq('user_id', user.id)
            .then(({ data }) => data?.map(m => m.circle_id) || [])
        )
        .order('started_at', { ascending: false });

      if (sprintsError) throw sprintsError;

      // Process sprints data
      const processedSprints: Sprint[] = (sprints || []).map((sprint: any) => {
        const now = new Date();
        const endsAt = new Date(sprint.ends_at);
        const timeRemaining = Math.max(0, endsAt.getTime() - now.getTime());
        
        return {
          id: sprint.id,
          circle_id: sprint.circle_id,
          user_id: sprint.user_id,
          topic: sprint.topic,
          goals: sprint.goals,
          quiz_question_count: sprint.quiz_question_count,
          tags: sprint.tags || [],
          started_at: sprint.started_at,
          ends_at: sprint.ends_at,
          media_url: sprint.media_url,
          end_media_url: sprint.end_media_url,
          circle_name: sprint.circles.name,
          username: sprint.profiles.username,
          is_active: timeRemaining > 0,
          time_remaining: timeRemaining
        };
      });

      setRecentSprints(processedSprints);

      // Load user's circles with stats
      const { data: circles, error: circlesError } = await supabase
        .rpc('get_user_circles');

      if (circlesError) {
        console.error('Error loading circles:', circlesError);
        throw circlesError;
      }

      // Get active sprint counts for each circle
      const circlesWithStats: Circle[] = await Promise.all(
        (circles || []).map(async (circle: any) => {
          const [{ count }, { data: streakRow }] = await Promise.all([
            supabase
              .from('sprints')
              .select('*', { count: 'exact', head: true })
              .eq('circle_id', circle.id)
              .gt('ends_at', new Date().toISOString()),
            supabase
              .from('circles')
              .select('current_streak')
              .eq('id', circle.id)
              .single()
          ]);

          return {
            id: circle.id,
            name: circle.name,
            member_count: circle.member_count,
            active_sprints: count || 0,
            current_streak: streakRow?.current_streak || 0
          };
        })
      );

      setMyCircles(circlesWithStats);

      // Fetch user streak info
      const { data: streakRow } = await supabase
        .from('streaks')
        .select('current_len, freeze_tokens')
        .eq('user_id', user.id)
        .single();
      if (streakRow) {
        setUserStreak({ current_len: streakRow.current_len, freeze_tokens: streakRow.freeze_tokens });
      } else {
        setUserStreak({ current_len: 0, freeze_tokens: 0 });
      }
    } catch (error) {
      console.error('Error loading sprints data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  const formatTimeRemaining = (milliseconds: number) => {
    const minutes = Math.floor(milliseconds / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Separate timer component to prevent parent re-renders
  const SprintTimer = memo(({ endsAt }: { endsAt: string }) => {
    const [timeRemaining, setTimeRemaining] = useState(0);
    
    useEffect(() => {
      const updateTimer = () => {
        const remaining = Math.max(0, new Date(endsAt).getTime() - Date.now());
        setTimeRemaining(remaining);
      };
      
      updateTimer(); // Initial update
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }, [endsAt]);
    
    const isStillActive = timeRemaining > 0;
    
    if (!isStillActive) return null;
    
    return (
      <View className={`rounded-full px-3 py-1 ${timeRemaining < 5 * 60 * 1000 ? 'bg-red-500' : 'bg-blue-500'}`}>
        <Text className="text-white font-mono text-sm">
          {formatTimeRemaining(timeRemaining)}
        </Text>
      </View>
    );
  });

  const deleteSprint = async (sprintId: string, sprintTopic: string) => {
    Alert.alert(
      'Delete Sprint',
      `Are you sure you want to delete the "${sprintTopic}" sprint? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('sprints')
                .delete()
                .eq('id', sprintId);

              if (error) throw error;

              // Refresh the data to remove the deleted sprint from the list
              loadData();
            } catch (error) {
              console.error('Error deleting sprint:', error);
              Alert.alert('Error', 'Failed to delete sprint. Please try again.');
            }
          }
        }
      ]
    );
  };

  const endSprint = async (sprintId: string, topic: string) => {
    Alert.alert(
      'End Sprint',
      `Take a completion photo for your "${topic}" sprint?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Skip Photo', 
          style: 'default',
          onPress: () => completeSprintWithoutPhoto(sprintId, topic)
        },
        { 
          text: 'Take Photo', 
          style: 'default',
          onPress: () => {
            setEndingSprintId(sprintId);
            setShowEndCamera(true);
          }
        }
      ]
    );
  };

  const completeSprintWithoutPhoto = async (sprintId: string, topic: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get sprint details first
      const { data: sprint } = await supabase
        .from('sprints')
        .select('circle_id, goals, quiz_question_count, started_at, ends_at')
        .eq('id', sprintId)
        .single();

      // Update sprint to end now
      const { error } = await supabase
        .from('sprints')
        .update({ ends_at: new Date().toISOString(), stopped_early: true })
        .eq('id', sprintId);

      if (error) throw error;

      // Send a system message about ending the sprint early
      if (sprint?.circle_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('user_id', user.id)
          .single();

        const username = profile?.username || 'Someone';
        const { error: messageError } = await supabase
          .from('messages')
          .insert({
            circle_id: sprint.circle_id,
            sender_id: user.id,
            content: `⏹️ ${username} ended their "${topic}" sprint early`
          });

        if (messageError) console.error('Error sending sprint end notification:', messageError);
      }

      // Show completion modal after sprint ends
      if (sprint) {
        // Calculate sprint duration
        const duration = Math.round((new Date(sprint.ends_at).getTime() - new Date(sprint.started_at).getTime()) / (1000 * 60));
        
        setCompletionSprintTopic(topic);
        setCompletionSprintDuration(duration);
        setQuizSprintId(sprintId);
        setQuizSprintTopic(topic);
        setQuizSprintGoals(sprint.goals || 'General study goals');
        setQuizCircleId(sprint.circle_id);
        setQuizSprintDuration(duration);
        setSelectedQuizQuestionCount(sprint.quiz_question_count || 3);
        setShowCompletionModal(true);
      }
      
      loadData(); // Refresh the data
    } catch (error) {
      console.error('Error ending sprint:', error);
      Alert.alert('Error', 'Failed to end sprint. Please try again.');
    }
  };

  const completeSprintWithPhoto = async (photoUrl: string) => {
    if (!endingSprintId) return;
    
    setShowEndCamera(false); // Close camera immediately
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get sprint details first
      const { data: sprint } = await supabase
        .from('sprints')
        .select('circle_id, topic, goals, quiz_question_count, started_at, ends_at')
        .eq('id', endingSprintId)
        .single();

      // Update sprint to end now and add completion photo
      const { error } = await supabase
        .from('sprints')
        .update({ 
          ends_at: new Date().toISOString(),
          stopped_early: true,
          end_media_url: photoUrl
        })
        .eq('id', endingSprintId);

      if (error) throw error;

      // Send a system message about ending the sprint with photo
      if (sprint?.circle_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('user_id', user.id)
          .single();

        const username = profile?.username || 'Someone';
        const { error: messageError } = await supabase
          .from('messages')
          .insert({
            circle_id: sprint.circle_id,
            sender_id: user.id,
            content: `🏁 ${username} completed their "${sprint.topic}" sprint!`
          });

        if (messageError) console.error('Error sending sprint completion notification:', messageError);
      }

      setEndingSprintId('');
      
      // Show completion modal after sprint ends
      if (sprint) {
        // Calculate sprint duration
        const duration = Math.round((new Date(sprint.ends_at).getTime() - new Date(sprint.started_at).getTime()) / (1000 * 60));
        
        setCompletionSprintTopic(sprint.topic || 'Study Sprint');
        setCompletionSprintDuration(duration);
        setQuizSprintId(endingSprintId);
        setQuizSprintTopic(sprint.topic || 'Study Sprint');
        setQuizSprintGoals(sprint.goals || 'General study goals');
        setQuizCircleId(sprint.circle_id);
        setQuizSprintDuration(duration);
        setSelectedQuizQuestionCount(sprint.quiz_question_count || 3);
        setShowCompletionModal(true);
      }
      
      loadData(); // Refresh the data
    } catch (error) {
      console.error('Error completing sprint:', error);
      Alert.alert('Error', 'Failed to complete sprint. Please try again.');
    }
  };

  const handleStartPhoto = (photoUrl: string) => {
    setStartPhotoUrl(photoUrl);
    setShowStartCamera(false); // Close camera immediately
    // Continue with sprint creation
    createSprintWithPhoto(photoUrl);
  };

  const createSprintWithPhoto = async (photoUrl: string) => {
    if (!sprintTopic.trim() || creatingSprintLoading) return;
    
    // Validate duration
    const duration = parseInt(customDuration);
    if (isNaN(duration) || duration < 1 || duration > 180) {
      Alert.alert('Invalid Duration', 'Please enter a duration between 1 and 180 minutes.');
      return;
    }
    
    try {
      setCreatingSprintLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Create sprint directly in database with photo
      const endsAt = new Date(Date.now() + duration * 60 * 1000);

      const { data: sprint, error: sprintError } = await supabase
        .from('sprints')
        .insert({
          circle_id: selectedCircleId,
          user_id: user.id,
          topic: sprintTopic.trim(),
          goals: sprintGoals.trim(),
          quiz_question_count: quizQuestionCount,
          tags: [],
          ends_at: endsAt.toISOString(),
          media_url: photoUrl
        })
        .select()
        .single();

      if (sprintError) throw sprintError;

      // Send a system message to the circle about the sprint start
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .single();

      const username = profile?.username || 'Someone';
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          circle_id: selectedCircleId,
          sender_id: user.id,
          content: `🏃‍♀️ ${username} started a ${duration}-minute sprint: "${sprintTopic}"`
        });

      if (messageError) console.error('Error sending sprint notification:', messageError);

      // Generate quiz questions in the background
      generateQuizForSprint(sprint.id, sprintTopic, sprintGoals, quizQuestionCount);

      setShowSprintModal(false);
      setStartPhotoUrl('');
      const currentTopic = sprintTopic; // Store before clearing
      setSprintTopic(''); // Clear form
      setSprintGoals(''); // Clear form
      setCustomDuration('25'); // Reset to default
      Alert.alert(
        'Sprint Started!', 
        `Your ${currentTopic} sprint has begun. Quiz questions are being generated in the background - they'll be ready when your sprint ends. Good luck!`
      );
      loadData(); // Refresh the data
    } catch (error) {
      console.error('Error starting sprint:', error);
      Alert.alert('Error', 'Failed to start sprint. Please try again.');
    } finally {
      setCreatingSprintLoading(false);
    }
  };

  const openSprintModal = (circleId: string) => {
    setSelectedCircleId(circleId);
    setSprintTopic('');
    setSprintGoals('');
    setSprintDuration(25);
    setCustomDuration('25'); // Default to 25 minutes (standard Pomodoro)
    setQuizQuestionCount(3); // Default to 3 questions
    setShowSprintModal(true);
  };

  const openQuizResults = (sprintId: string, sprintTopic: string) => {
    setResultsSprintId(sprintId);
    setResultsSprintTopic(sprintTopic);
    setShowQuizResultsModal(true);
  };

  const generateQuizForSprint = async (sprintId: string, topic: string, goals: string, questionCount: number) => {
    try {
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if summary already exists for this sprint
      let summary;
      const { data: existingSummary } = await supabase
        .from('summaries')
        .select('id, bullets, tags')
        .eq('sprint_id', sprintId)
        .single();

      if (existingSummary) {
        summary = existingSummary;
      } else {
        // Generate AI summary with RAG using edge function
        try {
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

          if (summaryResponse.ok) {
            const summaryResult = await summaryResponse.json();
            summary = summaryResult.summary;
          } else {
            throw new Error('Summary generation failed');
          }
        } catch (error) {
          console.error('RAG summary generation failed, using fallback:', error);
          // Fallback to simple summary
          const { data: newSummary, error: summaryError } = await supabase
            .from('summaries')
            .insert({
              sprint_id: sprintId,
              bullets: [`Study topic: ${topic}`, `Goals: ${goals}`],
              tags: topic.toLowerCase().split(/\s+/).filter(word => word.length > 2)
            })
            .select()
            .single();

          if (summaryError) {
            console.error('Error creating fallback summary:', summaryError);
            return;
          }
          summary = newSummary;
        }
      }

      // Check if quiz already exists for this summary
      const { data: existingQuiz } = await supabase
        .from('quizzes')
        .select('id')
        .eq('summary_id', summary.id)
        .single();

      if (existingQuiz) {
        return;
      }

      // Generate gap-aware quiz using RAG edge function
      try {
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

        let quizContent;
        if (gapAwareQuizResponse.ok) {
          const gapAwareResult = await gapAwareQuizResponse.json();
          quizContent = gapAwareResult.quiz;
        } else {
          throw new Error('Gap-aware quiz generation failed');
        }

        if (quizContent) {
          // Store the quiz in the database
          const { error: quizError } = await supabase
            .from('quizzes')
            .insert({
              summary_id: summary.id,
              mcq_json: quizContent
            });

          if (quizError) {
            console.error('Error storing quiz:', quizError);
          }
        }
      } catch (error) {
        console.error('RAG quiz generation failed, using fallback:', error);
        // Fallback to simple quiz generation
        const quizContent = await generateQuizWithChatGPT(topic, goals, questionCount);
        
        if (quizContent) {
          const { error: quizError } = await supabase
            .from('quizzes')
            .insert({
              summary_id: summary.id,
              mcq_json: quizContent
            });

          if (quizError) {
            console.error('Error storing fallback quiz:', quizError);
          }
        }
      }
    } catch (error) {
      console.error('Error generating quiz for sprint:', error);
    }
  };

  const generateQuizWithChatGPT = async (topic: string, goals: string, questionCount: number, maxRetries = 3) => {
    const prompt = `Generate a quiz with exactly ${questionCount} multiple choice questions based on this study sprint:

Topic: ${topic}
Goals: ${goals}

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
            max_tokens: 1500,
            temperature: 0.7
          })
        });

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const quizContent = JSON.parse(data.choices[0].message.content);
        
        return quizContent;
      } catch (error) {
        console.error(`Quiz generation attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          console.error('All quiz generation attempts failed');
          return null;
        }
        
        // Exponential backoff: wait 1s, 2s, 4s between retries
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return null;
  };

  const createSprint = async () => {
    if (!sprintTopic.trim() || creatingSprintLoading) return;
    
    if (!sprintGoals.trim()) {
      Alert.alert('Missing Goals', 'Please enter your study goals to help generate better quiz questions.');
      return;
    }
    
    // Validate duration
    const duration = parseInt(customDuration);
    if (isNaN(duration) || duration < 1 || duration > 180) {
      Alert.alert('Invalid Duration', 'Please enter a duration between 1 and 180 minutes.');
      return;
    }
    
    // Show camera to take start photo
    setShowSprintModal(false);
    setShowStartCamera(true);
  };

  useEffect(() => {
    loadData();
    
    // Set up real-time updates for sprints, circles, and circle membership
    const subscription = supabase
      .channel('sprints-and-circles-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sprints'
        },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'circle_members'
        },
        (payload) => {
          // Only reload if the change affects the current user
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          if (newRecord?.user_id === user?.id || oldRecord?.user_id === user?.id) {
            loadData();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'circles'
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [loadData]);

  const SwipeableSprintItem = memo(({ item }: { item: Sprint }) => {
    const isMySprintAndActive = item.user_id === user?.id && item.is_active;
    
    // Calculate if sprint is still active (static check, timer component handles real-time updates)
    const endsAt = new Date(item.ends_at).getTime();
    const isStillActive = endsAt > Date.now();
    const canDelete = !isStillActive; // Only allow deleting completed sprints
    
    const translateX = new Animated.Value(0);
    
    const onGestureEvent = Animated.event(
      [{ nativeEvent: { translationX: translateX } }],
      { useNativeDriver: true }
    );
    
    const onHandlerStateChange = (event: any) => {
      if (event.nativeEvent.state === 5) { // END state
        const { translationX } = event.nativeEvent;
        
        if (canDelete && translationX < -100) {
          // Swipe left far enough to delete
          deleteSprint(item.id, item.topic);
        }
        
        // Reset position
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    };
    
    const SprintContent = () => (
      <View className="bg-gray-900 rounded-lg p-4 mb-3 mx-4">
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-1">
            <Text className="text-white font-semibold text-lg">{item.topic}</Text>
            <Text className="text-gray-400 text-sm">{item.username} • {item.circle_name}</Text>
            {item.goals && (
              <Text className="text-gray-300 text-sm mt-1">Goals: {item.goals}</Text>
            )}
          </View>
          
          {/* Sprint Photos */}
          <View className="flex-row space-x-2">
            {item.media_url && (
              <View className="relative">
                <Image 
                  source={{ uri: item.media_url }} 
                  className="w-16 h-16 rounded-lg"
                  resizeMode="cover"
                />
                <View className="absolute bottom-0 left-0 right-0 bg-black/60 rounded-b-lg px-1 py-0.5">
                  <Text className="text-white text-xs text-center">Start</Text>
                </View>
              </View>
            )}
            {item.end_media_url && (
              <View className="relative">
                <Image 
                  source={{ uri: item.end_media_url }} 
                  className="w-16 h-16 rounded-lg"
                  resizeMode="cover"
                />
                <View className="absolute bottom-0 left-0 right-0 bg-black/60 rounded-b-lg px-1 py-0.5">
                  <Text className="text-white text-xs text-center">End</Text>
                </View>
              </View>
            )}
          </View>
          {isStillActive && (
            <SprintTimer endsAt={item.ends_at} />
          )}
          {!isStillActive && item.is_active && (
            <View className="bg-gray-600 rounded-full px-3 py-1 flex-row items-center">
              <Text className="text-white text-sm">Completed</Text>
              {canDelete && (
                <Feather name="chevron-left" size={14} color="white" style={{ marginLeft: 4 }} />
              )}
            </View>
          )}
        </View>
        
        {item.tags.length > 0 && (
          <View className="flex-row flex-wrap mb-2">
            {item.tags.map((tag, index) => (
              <View key={index} className="bg-gray-700 rounded-full px-2 py-1 mr-2 mb-1">
                <Text className="text-gray-300 text-xs">#{tag}</Text>
              </View>
            ))}
          </View>
        )}
        
        <View className="flex-row items-center justify-between">
          <Text className="text-gray-500 text-xs">
            Started {new Date(item.started_at).toLocaleTimeString()}
          </Text>
          <View className="flex-row items-center space-x-3">
            {isMySprintAndActive && isStillActive && (
              <TouchableOpacity 
                onPress={() => endSprint(item.id, item.topic)}
                className="flex-row items-center mr-3"
              >
                <Feather name="square" size={16} color="#EF4444" />
                <Text className="text-red-400 text-sm ml-1">End</Text>
              </TouchableOpacity>
            )}
            {!isStillActive && (
              <>
                <TouchableOpacity 
                  onPress={() => openQuizResults(item.id, item.topic)}
                  className="flex-row items-center mr-3"
                >
                  <Feather name="help-circle" size={16} color="#A78BFA" />
                  <Text className="text-purple-400 text-sm ml-1">Quiz</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => {
                    setConceptMapSprintId(item.id);
                    setConceptMapSprintTopic(item.topic);
                    setShowConceptMapModal(true);
                  }}
                  className="flex-row items-center mr-3"
                >
                  <Feather name="map" size={16} color="#10B981" />
                  <Text className="text-green-400 text-sm ml-1">Map</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity 
              onPress={() => router.push(`/(modals)/chat?circleId=${item.circle_id}`)}
              className="flex-row items-center"
            >
              <Feather name="message-circle" size={16} color="#60A5FA" />
              <Text className="text-blue-400 text-sm ml-1">Join</Text>
            </TouchableOpacity>
          </View>
        </View>
        

      </View>
    );
    
    if (!canDelete) {
      // For active sprints, just return the content without swipe functionality
      return <SprintContent />;
    }
    
    return (
      <View style={{ position: 'relative' }}>
        {/* Delete background */}
        <View className="absolute right-0 top-0 bottom-0 w-20 bg-red-500 rounded-r-lg mb-3 mr-4 flex justify-center items-center">
          <Feather name="trash-2" size={20} color="white" />
        </View>
        
        {/* Swipeable content */}
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View style={{ transform: [{ translateX }] }}>
            <SprintContent />
          </Animated.View>
        </PanGestureHandler>
      </View>
    );
  });

  const renderSprint = ({ item }: { item: Sprint }) => (
    <SwipeableSprintItem item={item} />
  );

  const renderCircle = ({ item }: { item: Circle }) => (
    <TouchableOpacity 
      onPress={() => openSprintModal(item.id)}
      className="bg-gray-800 rounded-lg p-4 mb-3 mx-4"
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1">
          <Text className="text-white font-semibold text-lg">{item.name}</Text>
          <Text className="text-gray-400 text-sm">
            {item.member_count} members • {item.active_sprints} active sprints • 🔥 {item.current_streak}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Feather name="zap" size={20} color="#10B981" />
          <Text className="text-green-400 text-sm ml-1">Start Sprint</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-black justify-center items-center" edges={['top', 'left', 'right']}>
        <Text className="text-white">Please log in</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-black justify-center items-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color="white" />
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <SafeAreaView className="flex-1 bg-black" edges={['top', 'left', 'right']}>
        <View className="flex-1" style={{ paddingBottom: 80 }}>
        {/* Header */}
        <View className="p-4 border-b border-gray-800">
          <Text className="text-white text-2xl font-bold">Study Sprints</Text>
          <Text className="text-gray-400 text-sm">Focus together with your circles</Text>
          <View className="flex-row items-center mt-1 space-x-4">
            <View className="flex-row items-center">
              <Feather name="zap" size={16} color="#FBBF24" />
              <Text className="text-yellow-400 text-sm ml-1">{userStreak.current_len} day streak</Text>
            </View>
            <View className="flex-row items-center">
              <Feather name="gift" size={16} color="#93C5FD" />
              <Text className="text-blue-300 text-sm ml-1">{userStreak.freeze_tokens} tokens</Text>
            </View>
          </View>
        </View>

        {/* Active Sprints Section */}
        <View className="flex-1">
          <View className="p-4 pb-2">
            <Text className="text-white text-lg font-semibold">Recent Sprints</Text>
          </View>
          
          {recentSprints.length > 0 ? (
            <FlatList
              data={recentSprints}
              renderItem={renderSprint}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData();
              }}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          ) : (
            <View className="flex-1 justify-center items-center px-8">
              <Feather name="zap" size={64} color="gray" />
              <Text className="text-gray-400 text-lg mt-4 text-center">
                No recent sprints
              </Text>
              <Text className="text-gray-500 text-sm mt-2 text-center">
                Start a sprint in one of your circles below
              </Text>
            </View>
          )}
        </View>

        {/* AI Topic Suggestion Section */}


        {/* My Circles Section */}
        <View className="border-t border-gray-800">
          <View className="p-4 pb-2">
            <Text className="text-white text-lg font-semibold">My Circles</Text>
          </View>
          
          <FlatList
            data={myCircles}
            renderItem={renderCircle}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 140 }}
            contentContainerStyle={{ paddingBottom: 10 }}
          />
        </View>
      </View>

      {/* Sprint Creation Modal */}
      <Modal
        visible={showSprintModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView className="flex-1 bg-black">
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View className="flex-1">
            {/* Header */}
            <View className="flex-row items-center justify-between p-4 border-b border-gray-800">
              <TouchableOpacity onPress={() => {
                setShowSprintModal(false);
                setSprintTopic('');
                setSprintGoals('');
                setCustomDuration('25');
                setQuizQuestionCount(3);
              }}>
                <Text className="text-blue-400 text-lg">Cancel</Text>
              </TouchableOpacity>
              <Text className="text-white text-lg font-semibold">New Sprint</Text>
              <TouchableOpacity 
                onPress={createSprint}
                disabled={!sprintTopic.trim() || !sprintGoals.trim() || creatingSprintLoading || !customDuration || parseInt(customDuration) < 1 || parseInt(customDuration) > 180}
              >
                <Text className={`text-lg font-semibold ${
                  sprintTopic.trim() && sprintGoals.trim() && !creatingSprintLoading && customDuration && parseInt(customDuration) >= 1 && parseInt(customDuration) <= 180 ? 'text-blue-400' : 'text-gray-600'
                }`}>
                  {creatingSprintLoading ? 'Creating...' : 'Start'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View className="flex-1 p-4">
              {/* Topic */}
              <View className="mb-6">
                <Text className="text-white text-lg font-semibold mb-2">What are you studying?</Text>
                <TextInput
                  value={sprintTopic}
                  onChangeText={setSprintTopic}
                  placeholder="e.g., React Native components"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-800 text-white p-4 rounded-lg text-base"
                  autoFocus
                />
              </View>

              {/* Goals */}
              <View className="mb-6">
                <Text className="text-white text-lg font-semibold mb-2">Goals</Text>
                <TextInput
                  value={sprintGoals}
                  onChangeText={setSprintGoals}
                  placeholder="e.g., Complete login screen, Fix navigation bug"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-800 text-white p-4 rounded-lg text-base"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <Text className="text-gray-400 text-xs mt-1">
                  Goals help generate better quiz questions
                </Text>
              </View>

              {/* Duration */}
              <View className="mb-6">
                <Text className="text-white text-lg font-semibold mb-2">Duration (minutes)</Text>
                <TextInput
                  value={customDuration}
                  onChangeText={(text) => {
                    setCustomDuration(text);
                    const num = parseInt(text);
                    if (!isNaN(num) && num >= 1 && num <= 180) {
                      setSprintDuration(num);
                    }
                  }}
                  placeholder="Enter duration (1-180 minutes)"
                  placeholderTextColor="#9CA3AF"
                  className="bg-gray-800 text-white p-4 rounded-lg text-base"
                  keyboardType="numeric"
                />
                {customDuration && (
                  <Text className={`text-xs mt-1 ${
                    parseInt(customDuration) >= 1 && parseInt(customDuration) <= 180 
                      ? 'text-gray-400' 
                      : 'text-red-400'
                  }`}>
                    {parseInt(customDuration) >= 1 && parseInt(customDuration) <= 180 
                      ? `Duration: ${parseInt(customDuration)} minutes`
                      : 'Duration must be between 1-180 minutes'
                    }
                  </Text>
                )}
              </View>

              {/* Quiz Questions */}
              <View className="mb-6">
                <Text className="text-white text-lg font-semibold mb-2">Quiz Questions</Text>
                <Text className="text-gray-400 text-sm mb-3">How many questions should be in your quiz?</Text>
                
                <View className="mb-4">
                  <Slider
                    style={{ width: '100%', height: 40 }}
                    minimumValue={3}
                    maximumValue={10}
                    step={1}
                    value={quizQuestionCount}
                    onValueChange={setQuizQuestionCount}
                    minimumTrackTintColor="#3B82F6"
                    maximumTrackTintColor="#4B5563"
                    thumbTintColor="#3B82F6"
                  />
                  
                  <View className="flex-row justify-between px-1">
                    <Text className="text-gray-500 text-xs">3</Text>
                    <Text className="text-gray-500 text-xs">10</Text>
                  </View>
                </View>
                
                <Text className="text-gray-400 text-center text-sm">
                  {quizQuestionCount} question{quizQuestionCount !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            </View>
          </TouchableWithoutFeedback>
        </SafeAreaView>
      </Modal>

      {/* Sprint Start Camera */}
      {showStartCamera && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
          <SprintCamera
            onCapture={handleStartPhoto}
            onCancel={() => {
              setShowStartCamera(false);
              setShowSprintModal(true); // Go back to sprint modal
            }}
          />
        </View>
      )}

      {/* Sprint End Camera */}
      {showEndCamera && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
          <SprintCamera
            onCapture={completeSprintWithPhoto}
            onCancel={() => {
              setShowEndCamera(false);
              setEndingSprintId('');
            }}
          />
        </View>
      )}

      {/* Sprint Completion Modal */}
      <SprintCompletionModal
        visible={showCompletionModal}
        sprintTopic={completionSprintTopic}
        sprintDuration={completionSprintDuration}
        onTakeQuiz={() => {
          setShowCompletionModal(false);
          setShowQuizModal(true);
        }}
      />

      {/* Quiz Modal */}
      <QuizModal
        visible={showQuizModal}
        onClose={() => setShowQuizModal(false)}
        sprintId={quizSprintId}
        sprintTopic={quizSprintTopic}
        sprintGoals={quizSprintGoals}
        circleId={quizCircleId}
        sprintDuration={quizSprintDuration}
        questionCount={selectedQuizQuestionCount}
      />

      {/* Quiz Results Modal */}
      <QuizResultsModal
        visible={showQuizResultsModal}
        onClose={() => setShowQuizResultsModal(false)}
        sprintId={resultsSprintId}
        sprintTopic={resultsSprintTopic}
      />

      {/* Concept Map Modal */}
      <ConceptMapModal
        visible={showConceptMapModal}
        onClose={() => setShowConceptMapModal(false)}
        sprintId={conceptMapSprintId}
        sprintTopic={conceptMapSprintTopic}
      />
    </SafeAreaView>
    </GestureHandlerRootView>
  );
} 