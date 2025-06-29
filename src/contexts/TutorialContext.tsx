import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TutorialStep } from '../components/Tutorial/TutorialOverlay';
import { useAuth } from './AuthContext';

interface TutorialProgress {
  hasSeenWelcome: boolean;
  hasSeenSprintCreation: boolean;
  hasSeenSprintCamera: boolean;
  hasSeenCircleChat: boolean;
  hasSeenFriendsDiscovery: boolean;
  hasSeenSprintTabs: boolean;
  hasSeenAdvancedFeatures: boolean;
  tutorialVersion: string;
  completedSteps: string[];
  lastCompletedStep?: string;
}

interface TutorialContextType {
  // Tutorial state
  isShowingTutorial: boolean;
  currentTutorial: string | null;
  currentStep: number;
  tutorialSteps: TutorialStep[];
  progress: TutorialProgress;
  tutorialQueue: string[]; // Queue of tutorials to show
  
  // Tutorial actions
  startTutorial: (tutorialId: string, steps: TutorialStep[]) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTutorial: () => void;
  completeTutorial: () => void;
  resetTutorials: () => void;
  checkAndStartTutorial: (tutorialId: string, steps: TutorialStep[]) => boolean;
  queueNextTutorial: (tutorialId: string) => void;
  checkAndStartNextQueuedTutorial: () => void;
  hasQueuedTutorial: (tutorialId: string) => boolean;
}

const TUTORIAL_STORAGE_KEY_PREFIX = '@sprintloop_tutorial_progress_';
const CURRENT_TUTORIAL_VERSION = '1.0';

const defaultProgress: TutorialProgress = {
  hasSeenWelcome: false,
  hasSeenSprintCreation: false,
  hasSeenSprintCamera: false,
  hasSeenCircleChat: false,
  hasSeenFriendsDiscovery: false,
  hasSeenSprintTabs: false,
  hasSeenAdvancedFeatures: false,
  tutorialVersion: CURRENT_TUTORIAL_VERSION,
  completedSteps: [],
};

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isShowingTutorial, setIsShowingTutorial] = useState(false);
  const [currentTutorial, setCurrentTutorial] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [tutorialSteps, setTutorialSteps] = useState<TutorialStep[]>([]);
  const [progress, setProgress] = useState<TutorialProgress>(defaultProgress);
  const [tutorialQueue, setTutorialQueue] = useState<string[]>([]);

  // Load progress when user changes
  useEffect(() => {
    if (user) {
      loadProgress();
    } else {
      setProgress(defaultProgress);
    }
  }, [user?.id]);

  const getStorageKey = () => {
    return user ? `${TUTORIAL_STORAGE_KEY_PREFIX}${user.id}` : null;
  };

  const loadProgress = async () => {
    try {
      // One-time cleanup: remove old generic tutorial key
      const oldKey = '@sprintloop_tutorial_progress';
      try {
        await AsyncStorage.removeItem(oldKey);
        console.log('[Tutorial Context] Cleaned up old generic tutorial key');
      } catch (e) {
        // Ignore cleanup errors
      }

      const storageKey = getStorageKey();
      if (!storageKey) {
        setProgress(defaultProgress);
        return;
      }

      const savedProgress = await AsyncStorage.getItem(storageKey);
      
      if (savedProgress) {
        const parsed = JSON.parse(savedProgress);
        // Check if tutorial version has changed
        if (parsed.tutorialVersion !== CURRENT_TUTORIAL_VERSION) {
          // Reset some tutorials for new version but keep basic progress
          setProgress({
            ...defaultProgress,
            hasSeenWelcome: parsed.hasSeenWelcome || false,
            completedSteps: parsed.completedSteps || [],
          });
        } else {
          setProgress(parsed);
        }
      } else {
        setProgress(defaultProgress);
      }
    } catch (error) {
      console.error('Error loading tutorial progress:', error);
      setProgress(defaultProgress);
    }
  };

  const saveProgress = async (newProgress: TutorialProgress) => {
    try {
      const storageKey = getStorageKey();
      if (!storageKey) {
        console.log('[Tutorial Context] Cannot save progress - no user');
        return;
      }

      await AsyncStorage.setItem(storageKey, JSON.stringify(newProgress));
      setProgress(newProgress);
    } catch (error) {
      console.error('Error saving tutorial progress:', error);
    }
  };

  const startTutorial = (tutorialId: string, steps: TutorialStep[]) => {
    setCurrentTutorial(tutorialId);
    setTutorialSteps(steps);
    setCurrentStep(0);
    setIsShowingTutorial(true);
  };

  const checkAndStartTutorial = (tutorialId: string, steps: TutorialStep[]): boolean => {
    // Check if this tutorial has been seen
    const hasSeenMap: Record<string, boolean> = {
      welcome: progress.hasSeenWelcome,
      sprintCreation: progress.hasSeenSprintCreation,
      sprintCamera: progress.hasSeenSprintCamera,
      circleChat: progress.hasSeenCircleChat,
      friendsDiscovery: progress.hasSeenFriendsDiscovery,
      sprintTabs: progress.hasSeenSprintTabs,
      advancedFeatures: progress.hasSeenAdvancedFeatures,
    };

    if (!hasSeenMap[tutorialId]) {
      console.log('[Tutorial Context] Starting tutorial:', tutorialId);
      startTutorial(tutorialId, steps);
      return true;
    }
    return false;
  };

  const nextStep = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
      
      // Save progress for each step
      const stepId = tutorialSteps[currentStep].id;
      if (!progress.completedSteps.includes(stepId)) {
        saveProgress({
          ...progress,
          completedSteps: [...progress.completedSteps, stepId],
          lastCompletedStep: stepId,
        });
      }
    }
  };

  const previousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipTutorial = () => {
    setIsShowingTutorial(false);
    setCurrentTutorial(null);
    setCurrentStep(0);
    setTutorialSteps([]);
  };

  const queueNextTutorial = (tutorialId: string) => {
    setTutorialQueue(prev => [...prev, tutorialId]);
  };

  const checkAndStartNextQueuedTutorial = () => {
    if (tutorialQueue.length > 0) {
      const nextTutorial = tutorialQueue[0];
      setTutorialQueue(prev => prev.slice(1));
      
      console.log('[Tutorial Context] Starting queued tutorial:', nextTutorial);
      
      // For now, just store that there's a queued tutorial
      // The actual tutorial will be triggered when the user navigates to the appropriate screen
      if (nextTutorial === 'friendsDiscovery') {
        console.log('[Tutorial Context] Friends tutorial queued, will start when user visits Friends tab');
      }
    }
  };

  const hasQueuedTutorial = (tutorialId: string) => {
    return tutorialQueue.includes(tutorialId);
  };

  const completeTutorial = () => {
    if (!currentTutorial) return;

    console.log('[Tutorial Context] Completing tutorial:', currentTutorial);

    // Mark tutorial as completed
    const newProgress = { ...progress };
    switch (currentTutorial) {
      case 'welcome':
        newProgress.hasSeenWelcome = true;
        break;
      case 'sprintCreation':
        newProgress.hasSeenSprintCreation = true;
        break;
      case 'sprintCamera':
        newProgress.hasSeenSprintCamera = true;
        break;
      case 'circleChat':
        newProgress.hasSeenCircleChat = true;
        break;
      case 'friendsDiscovery':
        newProgress.hasSeenFriendsDiscovery = true;
        break;
      case 'sprintTabs':
        newProgress.hasSeenSprintTabs = true;
        break;
      case 'advancedFeatures':
        newProgress.hasSeenAdvancedFeatures = true;
        break;
    }

    // Add all steps as completed
    const allStepIds = tutorialSteps.map(step => step.id);
    newProgress.completedSteps = [...new Set([...progress.completedSteps, ...allStepIds])];
    
    // Update progress state immediately and save
    setProgress(newProgress);
    saveProgress(newProgress);
    
    const completedTutorial = currentTutorial;
    
    // For circle chat/circles navigation tutorial, set a flag to trigger friends tutorial when user navigates to friends tab
    if (completedTutorial === 'circleChat') {
      console.log('[Tutorial Context] Circles/Circle chat completed, ready for friends tutorial');
      console.log('[Tutorial Context] Updated progress:', newProgress);
      // Set a timestamp so friends screen knows this just happened
      AsyncStorage.setItem('circleChat_completed_at', Date.now().toString()).catch(error => {
        console.error('[Tutorial Context] Error saving completion timestamp:', error);
      });
    }
    
    // Skip tutorial after setting flags
    skipTutorial();
    
    // Check if there are more tutorials queued
    checkAndStartNextQueuedTutorial();
  };

  const resetTutorials = async () => {
    const storageKey = getStorageKey();
    if (storageKey) {
      await AsyncStorage.removeItem(storageKey);
    }
    setProgress(defaultProgress);
  };

  return (
    <TutorialContext.Provider
      value={{
        isShowingTutorial,
        currentTutorial,
        currentStep,
        tutorialSteps,
        progress,
        tutorialQueue,
        startTutorial,
        nextStep,
        previousStep,
        skipTutorial,
        completeTutorial,
        resetTutorials,
        checkAndStartTutorial,
        queueNextTutorial,
        checkAndStartNextQueuedTutorial,
        hasQueuedTutorial,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
} 