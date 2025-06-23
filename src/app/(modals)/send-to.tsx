import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Image } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import useFriendsStore from '../../store/friends';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';

export default function SendToModal() {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['50%', '90%'], []);
  const { friends, toggleFriend, selectedCount } = useFriendsStore();
  const navigation = useNavigation();

  useEffect(() => {
    bottomSheetModalRef.current?.present();
    return () => {
        bottomSheetModalRef.current?.dismiss();
    }
  }, []);

  const handleSend = () => {
    // Implement send logic here
    console.log('Sending to:', friends.filter((f: any) => f.selected));
    bottomSheetModalRef.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      snapPoints={snapPoints}
      backgroundStyle={{ backgroundColor: '#1E1E1E' }}
      handleIndicatorStyle={{ backgroundColor: 'white' }}
    >
      <BottomSheetView style={{ flex: 1, padding: 16 }}>
        <View className="flex-row justify-between items-center mb-4">
            <Text className="text-white text-2xl font-bold">Send To</Text>
            <TouchableOpacity onPress={() => bottomSheetModalRef.current?.dismiss()}>
                <Feather name="x" size={24} color="white" />
            </TouchableOpacity>
        </View>
        <TextInput
          placeholder="Search friends..."
          placeholderTextColor="gray"
          className="bg-neutral-800 rounded-lg p-2 text-white mb-4"
        />
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => toggleFriend(item.id)} className="flex-row items-center p-2">
              <Image source={{ uri: item.avatar }} className="w-12 h-12 rounded-full mr-4" />
              <Text className="text-white text-lg flex-1">{item.name}</Text>
              <View className={`w-6 h-6 rounded-full border-2 ${item.selected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-400'}`} />
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={selectedCount() === 0}
          className={`py-3 rounded-lg mt-4 ${selectedCount() > 0 ? 'bg-indigo-500' : 'bg-gray-500'}`}
        >
          <Text className="text-white text-center font-bold text-lg">Send</Text>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
