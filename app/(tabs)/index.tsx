import { View, Text, TouchableOpacity } from 'react-native'
import React, { useRef, useState, useEffect } from 'react'
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera'
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import ShutterButton from '../../src/components/ShutterButton';

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
    return <View style={{ flex: 1, backgroundColor: 'black' }} />;
  }

  if (device == null) return (
    <View style={{ flex: 1, backgroundColor: 'black', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: 'white', fontSize: 24 }}>No camera device found</Text>
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
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <Camera
        ref={camera}
        style={{ flex: 1 }}
        device={device}
        isActive={true}
        photo={true}
        torch={torch}
      />
      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16 }}>
            {device.hasTorch && (
                <TouchableOpacity 
                  onPress={() => setTorch(t => t === 'on' ? 'off' : 'on')} 
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 }}
                >
                <Feather name={torch === 'on' ? 'zap' : 'zap-off'} size={24} color="white" />
                </TouchableOpacity>
            )}
          </View>
          <View style={{ alignItems: 'center', paddingBottom: 16 }}>
            <ShutterButton onPress={handleShutterPress} isRecording={false} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}
