import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 80,
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255, 255, 255, 0.2)',
        },
        tabBarActiveTintColor: 'white',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color }) => <Feather name="camera" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          tabBarIcon: ({ color }) => <Feather name="users" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          tabBarIcon: ({ color }) => <Feather name="inbox" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sprints"
        options={{
          tabBarIcon: ({ color }) => <Feather name="zap" size={28} color={color} />,
        }}
      />
    </Tabs>
  );
} 