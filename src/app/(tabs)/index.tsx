import { View, Text, TouchableOpacity } from 'react-native'
import React, { useRef, useState, useEffect } from 'react'
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera'
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import ShutterButton from '../../components/ShutterButton';

export default function CameraScreen() {
  const device = useCameraDevice('back')
  const { hasPermission, requestPermission } = useCameraPermission()
  const [torch, setTorch] = useState<'on' | 'off'>('off')
  const camera = useRef<Camera>(null)

  useEffect(() => {
    if (!hasPermission) {
      requestPermission()
    }
  }, [hasPermission])

  if (!hasPermission) {
    return <View className="flex-1 bg-black" />;
  }

  if (device == null) return (
    <View className="flex-1 bg-black items-center justify-center">
      <Text className="text-white text-2xl">No camera device found</Text>
    </View>
  )

  const handleShutterPress = async () => {
    if (camera.current) {
      try {
        const photo = await camera.current.takePhoto();
        console.log(photo.path);
      } catch (e) {
        console.error(e);
      }
    }
  }

  return (
    <View className="flex-1 bg-black">
      <Camera
        ref={camera}
        style={{ flex: 1 }}
        device={device}
        isActive={true}
        photo={true}
        torch={torch}
      />
      <SafeAreaView className="absolute top-0 left-0 right-0 bottom-0">
        <View className="flex-1 justify-between">
          <View className="flex-row justify-end p-4">
            {device.hasTorch && (
                <TouchableOpacity onPress={() => setTorch(t => t === 'on' ? 'off' : 'on')} className="bg-white/20 rounded-full p-2">
                <Feather name={torch === 'on' ? 'zap' : 'zap-off'} size={24} color="white" />
                </TouchableOpacity>
            )}
          </View>
          <View className="items-center pb-4">
            <ShutterButton onPress={handleShutterPress} isRecording={false} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
} 