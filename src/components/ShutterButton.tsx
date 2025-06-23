import { View, Text, TouchableOpacity, Pressable } from 'react-native'
import React from 'react'

type Props = {
    isRecording: boolean,
    onPress: () => void,
}

export default function ShutterButton({ isRecording, onPress }: Props) {
  return (
    <Pressable onPress={onPress} className={`w-[72px] h-[72px] rounded-full shadow-md ${isRecording ? 'bg-indigo-500' : 'bg-white'}`}>
    </Pressable>
  )
} 