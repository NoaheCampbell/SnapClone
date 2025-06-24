import { View, Text, TouchableOpacity, Alert } from 'react-native'
import React, { useState, useEffect, useRef } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';

// Check if running in Expo Go
const isExpoGo = Constants.executionEnvironment === 'storeClient';

export default function CameraScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [hasMediaLibraryPermission, setHasMediaLibraryPermission] = useState<boolean | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (permission?.granted) {
      setHasPermission(true);
    } else if (permission?.status === 'undetermined') {
      setHasPermission(null); // Still loading
    } else {
      setHasPermission(false); // Denied or other
    }
  }, [permission]);

  // Handle media library permissions
  useEffect(() => {
    if (mediaLibraryPermission?.granted) {
      setHasMediaLibraryPermission(true);
    } else if (mediaLibraryPermission?.status === 'undetermined') {
      setHasMediaLibraryPermission(null);
    } else {
      setHasMediaLibraryPermission(false);
    }
  }, [mediaLibraryPermission]);

  // Auto-request permissions on first load
  useEffect(() => {
    if (permission?.status === 'undetermined') {
      requestPermission();
    }
    if (mediaLibraryPermission?.status === 'undetermined') {
      requestMediaLibraryPermission();
    }
  }, [permission?.status, mediaLibraryPermission?.status, requestPermission, requestMediaLibraryPermission]);

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

  const handleTakePhoto = async () => {
    if (!cameraRef.current) return;
    
    if (!hasMediaLibraryPermission) {
      Alert.alert(
        'Permission Required',
        'Camera roll access is required to save photos. Please grant permission in Settings.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setIsCapturing(true);
      
      // Take the photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (photo?.uri) {
        // Save to camera roll
        await MediaLibrary.saveToLibraryAsync(photo.uri);
        
        Alert.alert(
          'Photo Saved! 📸',
          'Your photo has been saved to the camera roll.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(
        'Error',
        'Failed to take photo. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <CameraView 
        ref={cameraRef}
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
              disabled={isCapturing}
              style={{
                width: 70,
                height: 70,
                borderRadius: 35,
                backgroundColor: isCapturing ? 'gray' : 'white',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isCapturing ? 0.7 : 1
              }}
            >
              {isCapturing ? (
                <Feather name="camera" size={24} color="black" />
              ) : (
                <View style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: 'white',
                  borderWidth: 3,
                  borderColor: 'black'
                }} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
} 