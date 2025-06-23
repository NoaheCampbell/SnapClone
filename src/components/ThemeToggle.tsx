import React, { useEffect } from 'react';
import { View, Switch, Text } from 'react-native';
import { useColorScheme } from 'nativewind';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

export default function ThemeToggle() {
  const { colorScheme, setColorScheme } = useColorScheme();

  useEffect(() => {
    const savedScheme = storage.getString('colorScheme');
    if (savedScheme) {
      setColorScheme(savedScheme as 'light' | 'dark');
    }
  }, []);

  const toggleScheme = () => {
    const newScheme = colorScheme === 'dark' ? 'light' : 'dark';
    setColorScheme(newScheme);
    storage.set('colorScheme', newScheme);
  };

  return (
    <View className="flex-row items-center">
      <Text className="mr-2 text-black dark:text-white">
        {colorScheme === 'dark' ? 'Dark Mode' : 'Light Mode'}
      </Text>
      <Switch
        value={colorScheme === 'dark'}
        onValueChange={toggleScheme}
      />
    </View>
  );
} 