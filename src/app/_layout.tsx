import '../../global.css';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TutorialProvider, useTutorial } from '../contexts/TutorialContext';
import TutorialOverlay from '../components/Tutorial/TutorialOverlay';
import { useEffect } from 'react';
import { AppState } from 'react-native';

function AppStateHandler() {
  const { updateLastActive, user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        updateLastActive();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Update immediately when component mounts
    updateLastActive();

    return () => {
      subscription?.remove();
    };
  }, [user, updateLastActive]);

  return null;
}

function TutorialManager() {
  const {
    isShowingTutorial,
    tutorialSteps,
    currentStep,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
  } = useTutorial();

  return (
    <TutorialOverlay
      visible={isShowingTutorial}
      steps={tutorialSteps}
      currentStep={currentStep}
      onNext={nextStep}
      onPrevious={previousStep}
      onSkip={skipTutorial}
      onComplete={completeTutorial}
    />
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <TutorialProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <AppStateHandler />
            <TutorialManager />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(pages)" />
            </Stack>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </TutorialProvider>
    </AuthProvider>
  );
} 