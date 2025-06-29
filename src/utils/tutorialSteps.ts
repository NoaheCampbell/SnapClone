import { TutorialStep } from '../components/Tutorial/TutorialOverlay';
import { router } from 'expo-router';

export const welcomeTutorialSteps: TutorialStep[] = [
  {
    id: 'welcome-1',
    title: 'Welcome to SprintLoop! 🚀',
    description: 'SprintLoop helps you stay accountable with timed study sessions in groups. Let\'s show you how it works!',
    tooltipPosition: 'center',
    highlightColor: '#10B981', // Green theme throughout
  },
  {
    id: 'welcome-2',
    title: 'Meet Sprints ⏰',
    description: 'Sprints are focused study sessions with timers. Take a photo to start, study with friends, then take a quiz to test your knowledge!',
    tooltipPosition: 'center',
    highlightColor: '#10B981', // Green theme throughout
  },
  {
    id: 'welcome-3',
    title: 'Your Study Streak 🔥',
    description: 'Keep your streak alive by completing at least one sprint daily! You must finish the full timer AND take the quiz to count. Miss a day? Use freeze tokens to protect your streak!',
    // targetElement will be set dynamically when component mounts
    tooltipPosition: 'bottom',
    highlightColor: '#10B981', // Green color to match the navigation highlight
  },
  {
    id: 'welcome-4',
    title: 'Study Circles 👥',
    description: 'Circles are your study groups! Select a circle to create a sprint. Don\'t have any yet? Let\'s create one!',
    // targetElement will be set dynamically
    tooltipPosition: 'bottom',
    highlightColor: '#10B981', // Green color for consistency
  },
  {
    id: 'welcome-5',
    title: 'Navigate SprintLoop 🧭',
    description: 'Use these tabs to access your Circles (chat), Friends (social), and Settings. Tap the Friends tab to create your first circle!',
    // targetElement will be set dynamically
    tooltipPosition: 'top',
    highlightColor: '#10B981', // Green to draw attention
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
];

export const friendsDiscoverySteps: TutorialStep[] = [
  {
    id: 'friends-1',
    title: 'Find Study Buddies',
    description: 'Search for friends by username and send friend requests. Friends can invite you to their circles!',
    // targetElement will be set dynamically
    tooltipPosition: 'bottom',
  },
  {
    id: 'friends-2',
    title: 'Discover Study Groups',
    description: 'Switch to \'Circles\' to find public study groups you can join based on your interests.',
    // targetElement will be set dynamically
    tooltipPosition: 'bottom',
  },
  {
    id: 'friends-3',
    title: 'Join the Community',
    description: 'Tap \'Join\' to become part of a public study circle. Great for finding accountability partners!',
    // targetElement will be set dynamically
    tooltipPosition: 'left',
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