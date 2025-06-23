import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import ThemeToggle from '../../components/ThemeToggle';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsModal() {
  const navigation = useNavigation();

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="flex-row justify-between items-center p-4">
        <Text className="text-2xl font-bold text-black dark:text-white">Settings</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="x" size={24} className="text-black dark:text-white" />
        </TouchableOpacity>
      </View>
      <View className="p-4">
        <ThemeToggle />
      </View>
    </SafeAreaView>
  );
}
