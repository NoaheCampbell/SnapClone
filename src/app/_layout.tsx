import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(modals)/send-to" options={{ presentation: 'modal' }} />
          <Stack.Screen name="(modals)/settings" options={{ presentation: 'modal' }} />
        </Stack>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
} 