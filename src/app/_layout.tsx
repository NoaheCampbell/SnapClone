import '../../global.css';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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

export default function RootLayout() {
  return (
    <AuthProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppStateHandler />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(pages)" />
          </Stack>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AuthProvider>
  );
} 