import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import ConceptMapPage from '../../components/ConceptMapPage';

export default function ConceptMapScreen() {
  const params = useLocalSearchParams<{
    sprintId: string;
    sprintTopic: string;
  }>();

  return (
    <View className="flex-1 bg-black">
      <ConceptMapPage
        sprintId={params.sprintId || ''}
        sprintTopic={params.sprintTopic || 'Study Sprint'}
      />
    </View>
  );
} 