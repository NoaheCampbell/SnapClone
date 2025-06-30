import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import React, { createContext, useContext, useRef } from 'react';
import { View } from 'react-native';

// Context for tab refs
export const TabRefsContext = createContext<{
  friendsTabRef: React.RefObject<any>;
  inboxTabRef: React.RefObject<any>;
  sprintsTabRef: React.RefObject<any>;
  settingsTabRef: React.RefObject<any>;
} | null>(null);

export function useTabRefs() {
  const context = useContext(TabRefsContext);
  if (!context) {
    throw new Error('useTabRefs must be used within TabLayout');
  }
  return context;
}

export default function TabLayout() {
  const friendsTabRef = useRef(null);
  const inboxTabRef = useRef(null);
  const sprintsTabRef = useRef(null);
  const settingsTabRef = useRef(null);

  return (
    <TabRefsContext.Provider value={{ friendsTabRef, inboxTabRef, sprintsTabRef, settingsTabRef }}>
      <Tabs
        screenOptions={{
          tabBarShowLabel: false,
          tabBarStyle: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 80,
            backgroundColor: 'rgba(0, 0, 0, 1)',
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
            href: null, // Hide this tab from the tab bar
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            tabBarIcon: ({ color }) => (
              <View ref={friendsTabRef}>
                <Feather name="users" size={28} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="inbox"
          options={{
            tabBarIcon: ({ color }) => (
              <View ref={inboxTabRef}>
                <Feather name="inbox" size={28} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="sprints"
          options={{
            tabBarIcon: ({ color }) => (
              <View ref={sprintsTabRef}>
                <Feather name="zap" size={28} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            tabBarIcon: ({ color }) => (
              <View ref={settingsTabRef}>
                <Feather name="settings" size={28} color={color} />
              </View>
            ),
          }}
        />
      </Tabs>
    </TabRefsContext.Provider>
  );
} 