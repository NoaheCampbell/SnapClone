import '../../global.css';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { AuthProvider } from '../contexts/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <AuthProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <BottomSheetModalProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(modals)/send-to" options={{ presentation: 'modal' }} />
              <Stack.Screen name="(modals)/settings" options={{ presentation: 'modal' }} />
              <Stack.Screen name="(modals)/chat" options={{ presentation: 'modal' }} />
              <Stack.Screen name="(modals)/new-chat" options={{ presentation: 'modal' }} />
            </Stack>
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AuthProvider>
  );
} 