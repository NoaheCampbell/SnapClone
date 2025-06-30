import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dimensions } from 'react-native';
import { useTabRefs } from '../app/(tabs)/_layout';

const TUTORIAL_KEY = 'tutorial_completed';

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetRef?: React.RefObject<any>;
  targetPosition?: { x: number; y: number; width: number; height: number };
  highlightPadding?: number;
  placement?: 'top' | 'bottom' | 'center';
  customHighlight?: boolean;
}

export function useTutorial() {
  const [showTutorial, setShowTutorial] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);
  
  // Refs for tutorial targets in sprints tab
  const streakRef = useRef(null);
  const startSprintRef = useRef(null);
  const sprintListRef = useRef(null);
  const circlesRef = useRef(null);
  
  // Get tab refs from context (will be null if not in tabs layout)
  let tabRefs: any = { 
    friendsTabRef: useRef(null), 
    inboxTabRef: useRef(null), 
    sprintsTabRef: useRef(null), 
    settingsTabRef: useRef(null) 
  };
  
  try {
    tabRefs = useTabRefs();
  } catch (e) {
    // Not in tab layout context, use default refs
  }

  useEffect(() => {
    checkTutorialStatus();
  }, []);

  const checkTutorialStatus = async () => {
    try {
      const completed = await AsyncStorage.getItem(TUTORIAL_KEY);
      if (completed !== 'true') {
        setIsFirstTime(true);
        // Wait a bit for the UI to settle before showing tutorial
        setTimeout(() => setShowTutorial(true), 500);
      }
    } catch (error) {
      console.error('Error checking tutorial status:', error);
    }
  };

  const resetTutorial = async () => {
    try {
      await AsyncStorage.removeItem(TUTORIAL_KEY);
      setShowTutorial(true);
    } catch (error) {
      console.error('Error resetting tutorial:', error);
    }
  };

  const completeTutorial = () => {
    setShowTutorial(false);
    setIsFirstTime(false);
  };

  const tutorialSteps: TutorialStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to Your Study Hub! 🎉',
      description: 'Let\'s take a quick tour to help you get started with building better study habits.',
      placement: 'center',
      customHighlight: true,
    },
    {
      id: 'streak',
      title: 'Your Study Streak 🔥',
      description: 'Build daily study habits! Your streak increases when you complete study sprints each day. Use freeze tokens to maintain streaks on busy days.',
      targetRef: streakRef,
      placement: 'bottom',
      highlightPadding: 10,
    },
    {
      id: 'start-sprint',
      title: 'Start Your First Sprint 🚀',
      description: 'Sprints are timed study sessions. Tap here to create your first sprint and start studying with friends!',
      targetRef: startSprintRef,
      placement: 'bottom',
      highlightPadding: 12,
    },
    {
      id: 'active-sprints',
      title: 'Active Sprints Feed 📚',
      description: 'See what others in your circles are studying right now. You can join their sprints or get inspired for your own topics.',
      targetRef: sprintListRef,
      placement: 'top',
      highlightPadding: 10,
    },
    {
      id: 'circles',
      title: 'Your Study Circles 👥',
      description: 'Circles are study groups where you share progress and motivate each other. You\'re already in the Welcome Circle!',
      targetRef: circlesRef,
      placement: 'top',
      highlightPadding: 10,
    },
    {
      id: 'friends-tab',
      title: 'Connect with Study Partners 🤝',
      description: 'Find friends and discover new study circles that match your interests.',
      targetRef: tabRefs.friendsTabRef,
      placement: 'top',
      highlightPadding: 12,
    },
    {
      id: 'inbox-tab',
      title: 'Circle Messages 💬',
      description: 'Chat with your study circles, share progress, and celebrate achievements together.',
      targetRef: tabRefs.inboxTabRef,
      placement: 'top',
      highlightPadding: 12,
    },
    {
      id: 'navigation',
      title: 'Quick Navigation 🧭',
      description: 'Use the bottom tabs to navigate: Friends, Inbox, Sprints (your home), and Settings.',
      targetPosition: { x: 0, y: Dimensions.get('window').height - 80, width: Dimensions.get('window').width, height: 80 },
      placement: 'top',
      highlightPadding: 0,
    },
    {
      id: 'ready',
      title: 'You\'re All Set! 🎯',
      description: 'Time to create your first sprint and start building great study habits. Let\'s go!',
      targetRef: startSprintRef,
      placement: 'bottom',
      highlightPadding: 12,
    },
  ];

  return {
    showTutorial,
    isFirstTime,
    tutorialSteps,
    completeTutorial,
    resetTutorial,
    refs: {
      streakRef,
      startSprintRef,
      sprintListRef,
      circlesRef,
      friendsTabRef: tabRefs.friendsTabRef,
      inboxTabRef: tabRefs.inboxTabRef,
      sprintsTabRef: tabRefs.sprintsTabRef,
      settingsTabRef: tabRefs.settingsTabRef,
    },
  };
} 