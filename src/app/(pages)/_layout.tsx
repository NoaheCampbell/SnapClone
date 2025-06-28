import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function PagesLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack 
        screenOptions={{ 
          headerShown: false,
          animation: 'slide_from_right', // Consistent navigation animation
          contentStyle: { backgroundColor: '#000' }, // Match your app's dark theme
        }}
      >
        <Stack.Screen name="chat" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="new-chat" />
        <Stack.Screen name="send-to" />
        <Stack.Screen name="circle-settings" />
        <Stack.Screen name="discover-circles" />
        <Stack.Screen name="testEdge" />
        <Stack.Screen name="thread" />
      </Stack>
    </>
  );
} 