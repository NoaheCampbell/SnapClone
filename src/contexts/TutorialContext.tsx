import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TutorialStep } from '../components/Tutorial/TutorialOverlay';
import { useAuth } from './AuthContext';

interface TutorialProgress {
  hasSeenWelcome: boolean;
  hasSeenSprintCreation: boolean;
  hasSeenCircleChat: boolean;
  hasSeenFriendsDiscovery: boolean;
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
  
  // Tutorial actions
  startTutorial: (tutorialId: string, steps: TutorialStep[]) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTutorial: () => void;
  completeTutorial: () => void;
  resetTutorials: () => void;
  checkAndStartTutorial: (tutorialId: string, steps: TutorialStep[]) => boolean;
}

const TUTORIAL_STORAGE_KEY_PREFIX = '@sprintloop_tutorial_progress_';
const CURRENT_TUTORIAL_VERSION = '1.0';

const defaultProgress: TutorialProgress = {
  hasSeenWelcome: false,
  hasSeenSprintCreation: false,
  hasSeenCircleChat: false,
  hasSeenFriendsDiscovery: false,
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

  // Load progress when user changes
  useEffect(() => {
    if (user) {
      console.log('[Tutorial Context] User changed, loading tutorial progress for:', user.id);
      loadProgress();
    } else {
      console.log('[Tutorial Context] No user, resetting to default progress');
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
        console.log('[Tutorial Context] No storage key (no user), using default progress');
        setProgress(defaultProgress);
        return;
      }

      const savedProgress = await AsyncStorage.getItem(storageKey);
      console.log('[Tutorial Context] Loaded progress:', savedProgress);
      
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
        console.log('[Tutorial Context] No saved progress, using default');
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
    console.log('[Tutorial Context] checkAndStartTutorial called:', { tutorialId, stepsCount: steps.length });
    
    // Check if this tutorial has been seen
    const hasSeenMap: Record<string, boolean> = {
      welcome: progress.hasSeenWelcome,
      sprintCreation: progress.hasSeenSprintCreation,
      circleChat: progress.hasSeenCircleChat,
      friendsDiscovery: progress.hasSeenFriendsDiscovery,
      advancedFeatures: progress.hasSeenAdvancedFeatures,
    };

    console.log('[Tutorial Context] Has seen map:', hasSeenMap);
    console.log('[Tutorial Context] Has seen this tutorial?', hasSeenMap[tutorialId]);

    if (!hasSeenMap[tutorialId]) {
      console.log('[Tutorial Context] Starting tutorial:', tutorialId);
      startTutorial(tutorialId, steps);
      return true;
    }
    console.log('[Tutorial Context] Tutorial already seen:', tutorialId);
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

  const completeTutorial = () => {
    if (!currentTutorial) return;

    // Mark tutorial as completed
    const newProgress = { ...progress };
    switch (currentTutorial) {
      case 'welcome':
        newProgress.hasSeenWelcome = true;
        break;
      case 'sprintCreation':
        newProgress.hasSeenSprintCreation = true;
        break;
      case 'circleChat':
        newProgress.hasSeenCircleChat = true;
        break;
      case 'friendsDiscovery':
        newProgress.hasSeenFriendsDiscovery = true;
        break;
      case 'advancedFeatures':
        newProgress.hasSeenAdvancedFeatures = true;
        break;
    }

    // Add all steps as completed
    const allStepIds = tutorialSteps.map(step => step.id);
    newProgress.completedSteps = [...new Set([...progress.completedSteps, ...allStepIds])];
    
    saveProgress(newProgress);
    skipTutorial();
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
        startTutorial,
        nextStep,
        previousStep,
        skipTutorial,
        completeTutorial,
        resetTutorials,
        checkAndStartTutorial,
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