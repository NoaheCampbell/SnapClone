import { View, Text, TouchableOpacity } from 'react-native'
import React, { useState, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera'; 

// Check if running in Expo Go
const isExpoGo = Constants.executionEnvironment === 'storeClient';

export default function CameraScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [torchOn, setTorchOn] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (permission?.granted) {
      setHasPermission(true);
    } else if (permission?.status === 'undetermined') {
      setHasPermission(null); // Still loading
    } else {
      setHasPermission(false); // Denied or other
    }
  }, [permission]);

  // Auto-request permission on first load
  useEffect(() => {
    if (permission?.status === 'undetermined') {
      requestPermission();
    }
  }, [permission?.status, requestPermission]);

  if (hasPermission === null) {
    return <View style={{ flex: 1, backgroundColor: 'black' }} />;
  }
  
  if (hasPermission === false) {
    return (
      <View style={{ flex: 1, backgroundColor: 'black', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Feather name="camera-off" size={60} color="white" style={{ marginBottom: 20 }} />
        <Text style={{ color: 'white', fontSize: 18, textAlign: 'center', marginBottom: 20 }}>
          Camera permission required
        </Text>
        <TouchableOpacity 
          onPress={requestPermission}
          style={{
            backgroundColor: 'white',
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 25,
          }}
        >
          <Text style={{ color: 'black', fontSize: 16, fontWeight: 'bold' }}>
            Grant Camera Permission
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleTakePhoto = () => {
    console.log('Photo taken!');
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <CameraView 
        style={{ flex: 1 }} 
        facing={'back'}
        enableTorch={torchOn}
      />
      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16 }}>
            <TouchableOpacity 
              onPress={() => setTorchOn(!torchOn)} 
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 }}
            >
              <Feather name={torchOn ? 'zap' : 'zap-off'} size={24} color="white" />
            </TouchableOpacity>
          </View>
          <View style={{ alignItems: 'center', paddingBottom: 16 }}>
            <TouchableOpacity 
              onPress={handleTakePhoto}
              style={{
                width: 70,
                height: 70,
                borderRadius: 35,
                backgroundColor: 'white',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <View style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: 'white',
                borderWidth: 3,
                borderColor: 'black'
              }} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
} 