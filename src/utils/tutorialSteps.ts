import { TutorialStep } from '../components/Tutorial/TutorialOverlay';
import { router } from 'expo-router';

// Extended interface for tutorial steps that will be transformed
interface RawTutorialStep extends Omit<TutorialStep, 'targetElement'> {
  highlightElement: string | null;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  targetX: number;
  targetY: number;
}

export const welcomeTutorialSteps: RawTutorialStep[] = [
  {
    id: 'welcome-1',
    title: 'Welcome to SprintLoop! 🎉',
    description: 'Your social study companion. Complete focused study sessions with friends and stay motivated together!',
    highlightElement: null,
    position: 'center',
    targetX: 0,
    targetY: 0,
  },
  {
    id: 'welcome-2',
    title: 'Study Sprints 🏃‍♂️',
    description: 'Create timed study sessions called "Sprints". Set a timer, stay focused, and take a photo to prove you completed it!',
    highlightElement: 'sprintButton',
    position: 'top',
    targetX: 0,
    targetY: 250,
  },
  {
    id: 'welcome-3',
    title: 'Your Study Streak 🔥',
    description: 'Keep your streak alive by completing at least one sprint daily! You must finish the full timer AND take the quiz to count. Miss a day? Use freeze tokens to protect your streak!',
    highlightElement: 'streakSection',
    position: 'bottom',
    targetX: 0,
    targetY: 350,
  },
  {
    id: 'welcome-4',
    title: 'Study Circles 👥',
    description: 'Join or create "Circles" - study groups where you can complete sprints together, chat, and motivate each other! Tap the Circles tab to explore!',
    highlightElement: 'circlesTab',
    position: 'top',
    targetX: 0,
    targetY: 600,
    requiresInteraction: true,
  },
  {
    id: 'welcome-5',
    title: 'Navigate SprintLoop 🧭',
    description: 'Use the tabs below to navigate between Sprints, Circles (chat), Friends (social), and Settings.',
    highlightElement: 'tabBar',
    position: 'top',
    targetX: 0,
    targetY: 600,
  },
];

export const circleCreationSteps: TutorialStep[] = [
  {
    id: 'circle-1',
    title: 'Name Your Study Group',
    description: 'Give your circle a descriptive name. This is where you and your study buddies will sprint together!',
    // targetElement will be set dynamically
    tooltipPosition: 'bottom',
  },
  {
    id: 'circle-2',
    title: 'Circle Privacy',
    description: 'Public circles can be discovered by anyone. Private circles are invite-only for focused study groups.',
    // targetElement will be set dynamically
    tooltipPosition: 'right',
  },
  {
    id: 'circle-3',
    title: 'Default Sprint Length',
    description: 'Set how long sprints in this circle should last. 25 minutes (Pomodoro) is popular, but choose what works for your group!',
    // targetElement will be set dynamically
    tooltipPosition: 'top',
  },
];

export const sprintCreationSteps: TutorialStep[] = [
  {
    id: 'sprint-1',
    title: 'What Are You Studying?',
    description: 'Be specific! This helps generate better quiz questions and keeps you accountable to your goals.',
    // targetElement will be set dynamically
    tooltipPosition: 'bottom',
  },
  {
    id: 'sprint-2',
    title: 'Set Specific Goals',
    description: 'List 1-3 specific things you want to accomplish. These become your quiz topics!',
    // targetElement will be set dynamically
    tooltipPosition: 'right',
  },
  {
    id: 'sprint-3',
    title: 'Post-Sprint Quiz',
    description: 'After your sprint, you\'ll take an AI-generated quiz based on your topic and goals. Choose how many questions!',
    // targetElement will be set dynamically
    tooltipPosition: 'top',
  },
  {
    id: 'sprint-4',
    title: 'Accountability Matters!',
    description: 'Next, you\'ll take a photo to start your sprint. This keeps you honest and motivated!',
    // targetElement will be set dynamically
    tooltipPosition: 'top',
  },
];

export const sprintCameraSteps: TutorialStep[] = [
  {
    id: 'camera-1',
    title: 'Smile! You\'re Starting! 📸',
    description: 'Take a quick photo to begin your sprint. This creates accountability and shows your circle you\'re serious!',
    // targetElement will be set dynamically
    tooltipPosition: 'top',
  },
  {
    id: 'camera-2',
    title: 'Sprint Started! ⏰',
    description: 'Your timer is now running! Study hard - others in your circle can see your sprint and join you.',
    tooltipPosition: 'center',
  },
];

export const circleChatSteps: TutorialStep[] = [
  {
    id: 'chat-1',
    title: 'Chat With Your Circle',
    description: 'This is where your study group hangs out! Share progress, ask questions, and encourage each other.',
    // targetElement will be set dynamically
    tooltipPosition: 'top',
  },
  {
    id: 'chat-2',
    title: 'Sprint Updates',
    description: 'When someone starts a sprint, it appears here! Tap \'Join Sprint\' to study together.',
    // targetElement will be set dynamically
    tooltipPosition: 'right',
  },
  {
    id: 'chat-3',
    title: 'Share & React',
    description: 'Share photos of your study setup, notes, or progress. Long-press messages to add reactions!',
    // targetElement will be set dynamically
    tooltipPosition: 'top',
  },
  {
    id: 'chat-4',
    title: 'Start Discussions',
    description: 'Tap thread counts to continue conversations without cluttering the main chat.',
    // targetElement will be set dynamically
    tooltipPosition: 'right',
  },
  {
    id: 'chat-5',
    title: 'Ready to Find Study Buddies! 👥',
    description: 'Great job! You\'ve mastered circle chats. After finishing this tutorial, head to the Friends tab to discover study partners and join more circles!',
    tooltipPosition: 'center',
  },
];

export const friendsDiscoverySteps: TutorialStep[] = [
  {
    id: 'friends-1',
    title: 'Find Study Buddies 🔍',
    description: 'Tap the search button to find friends by username. Send friend requests to connect and study together!',
    // targetElement will be set dynamically
    tooltipPosition: 'bottom',
  },
  {
    id: 'friends-2',
    title: 'AI-Powered Circle Discovery 🤖',
    description: 'Now let\'s explore AI-powered study group suggestions! Tap "Discover Circles" to see circles that match your interests.',
    // targetElement will be set dynamically
    tooltipPosition: 'bottom',
    requiresInteraction: true,
    onTargetPress: () => {
      // This will be handled in the friends screen
    }
  },
  {
    id: 'friends-3',
    title: 'Smart Circle Matching 🎯',
    description: 'Each suggestion shows why it\'s a good match for you. Tap "Join" to become part of circles that align with your study goals!',
    // targetElement will be set dynamically
    tooltipPosition: 'left',
  },
  {
    id: 'friends-4',
    title: 'Refresh for More 🔄',
    description: 'Tap the refresh button to get new AI-powered suggestions based on your latest activity. The more you study, the better the recommendations!',
    // targetElement will be set dynamically
    tooltipPosition: 'bottom',
  },
];

export const sprintTabsTutorialSteps: TutorialStep[] = [
  {
    id: 'sprint-tabs-1',
    title: 'Choose Your Mode 🎯',
    description: 'Use "Start Sprint" to create a new focused study session. Switch to "Recent Sprints" to see active and completed sprints from your circles.',
    // targetElement will be set dynamically
    tooltipPosition: 'bottom',
  },
  {
    id: 'sprint-tabs-2',
    title: 'Start a Sprint 🚀',
    description: 'Select any of your circles to begin a new sprint. Each circle has its own sprint duration and community!',
    // targetElement will be set dynamically
    tooltipPosition: 'top',
  },
  {
    id: 'sprint-tabs-3',
    title: 'View Active Sprints 👀',
    description: 'Switch to "Recent Sprints" to see what your friends are studying right now. Tap the Recent Sprints tab!',
    // targetElement will be set dynamically
    tooltipPosition: 'bottom',
    requiresInteraction: true,
    onTargetPress: () => {
      // This will be handled in the sprints screen
    }
  },
  {
    id: 'sprint-tabs-4',
    title: 'Sprint Actions 🎬',
    description: 'For active sprints, you can join to study together. For completed sprints, view the quiz results or concept map to learn from others!',
    // targetElement will be set dynamically
    tooltipPosition: 'right',
  },
];

export const tutorialCompletedStep: TutorialStep = {
  id: 'complete',
  title: 'Tutorial Complete! 🎉',
  description: 'You now know how to create circles, start sprints, chat with study buddies, and find new groups. Time to build those study streaks!',
  tooltipPosition: 'center',
  highlightColor: '#10B981', // Green theme throughout
  action: () => {
    // Return to sprints tab
    setTimeout(() => {
      router.push('/(tabs)/sprints');
    }, 300);
  },
}; 