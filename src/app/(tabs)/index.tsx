import { View, Text, TouchableOpacity, Alert, TextInput } from 'react-native'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS, useAnimatedGestureHandler } from 'react-native-reanimated';

// Check if running in Expo Go
const isExpoGo = Constants.executionEnvironment === 'storeClient';

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold';
  isEditing: boolean;
}

export default function CameraScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [hasMediaLibraryPermission, setHasMediaLibraryPermission] = useState<boolean | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const [permission, requestPermission] = useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const cameraRef = useRef<CameraView>(null);

  // Text colors
  const textColors = ['#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];

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

  const addTextOverlay = () => {
    console.log('Adding new text overlay');
    const newText: TextOverlay = {
      id: Date.now().toString(),
      text: 'Text',
      x: 200, // Center-ish position
      y: 300,
      fontSize: 24,
      color: '#FFFFFF',
      fontWeight: 'normal',
      isEditing: false
    };
    console.log('New text overlay created:', newText);
    setTextOverlays([...textOverlays, newText]);
    setSelectedTextId(newText.id);
    console.log('Text overlays after adding:', textOverlays.length + 1);
  };

  const updateTextOverlay = (id: string, updates: Partial<TextOverlay>) => {
    setTextOverlays(textOverlays.map(text => 
      text.id === id ? { ...text, ...updates } : text
    ));
  };

  const startEditingText = (id: string) => {
    console.log('startEditingText called for id:', id);
    const text = textOverlays.find(t => t.id === id);
    if (text) {
      console.log('Found text to edit:', text.text);
      setEditingText(text.text);
      updateTextOverlay(id, { isEditing: true });
      setSelectedTextId(id);
    } else {
      console.log('Text not found for id:', id);
    }
  };

  const finishEditingText = (id: string) => {
    console.log('Finishing edit for id:', id, 'with text:', editingText);
    updateTextOverlay(id, { 
      text: editingText.trim() || 'Text', 
      isEditing: false 
    });
    setEditingText('');
    setSelectedTextId(null);
  };

  const deleteTextOverlay = (id: string) => {
    setTextOverlays(textOverlays.filter(text => text.id !== id));
    setSelectedTextId(null);
  };

  const clearAllText = () => {
    setTextOverlays([]);
    setSelectedTextId(null);
  };

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

  const DraggableText = ({ textOverlay }: { textOverlay: TextOverlay }) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

     const tapGesture = Gesture.Tap()
      .onEnd(() => {
        console.log('Tap gesture detected on text:', textOverlay.id);
        runOnJS(startEditingText)(textOverlay.id);
      });

    const panGesture = Gesture.Pan()
      .onBegin((event) => {
        console.log('Pan gesture began at:', event.x, event.y);
      })
      .onUpdate((event) => {
        console.log('Pan gesture update - translation:', event.translationX, event.translationY);
        translateX.value = event.translationX;
        translateY.value = event.translationY;
      })
      .onEnd((event) => {
        const { translationX, translationY } = event;
        console.log('Pan gesture ended - final translation:', translationX, translationY);

        runOnJS(updateTextOverlay)(textOverlay.id, {
          x: textOverlay.x + translationX,
          y: textOverlay.y + translationY,
        });

        translateX.value = 0;
        translateY.value = 0;
      });

    const composedGesture = Gesture.Race(tapGesture, panGesture);

    const animatedStyle = useAnimatedStyle(() => {
      return {
        transform: [
          { translateX: translateX.value },
          { translateY: translateY.value },
        ],
      };
    });

    if (textOverlay.isEditing) {
      return (
        <Animated.View
          style={[
            animatedStyle,
            {
              position: 'absolute',
              left: textOverlay.x,
              top: textOverlay.y,
            },
          ]}
        >
          <View
            style={{
              padding: 8,
              backgroundColor: 'rgba(0,0,0,0.7)',
              borderRadius: 8,
              borderWidth: 2,
              borderColor: '#007AFF',
              minWidth: 100,
            }}
          >
            <TextInput
              value={editingText}
              onChangeText={setEditingText}
              onBlur={() => {
                console.log('TextInput onBlur triggered');
                finishEditingText(textOverlay.id);
              }}
              onSubmitEditing={() => finishEditingText(textOverlay.id)}
              style={{
                fontSize: textOverlay.fontSize,
                color: textOverlay.color,
                fontWeight: textOverlay.fontWeight,
                textAlign: 'center',
                minWidth: 60,
              }}
              autoFocus={true}
              selectTextOnFocus={true}
              multiline={false}
              maxLength={100}
              blurOnSubmit={true}
            />
          </View>
        </Animated.View>
      );
    }

          return (
        <GestureDetector gesture={composedGesture}>
          <Animated.View
            style={[
              animatedStyle,
              {
                position: 'absolute',
                left: textOverlay.x,
                top: textOverlay.y,
              },
            ]}
          >
            <View
              style={{
                padding: 8,
                backgroundColor:
                  selectedTextId === textOverlay.id ? 'rgba(255,255,255,0.2)' : 'transparent',
                borderRadius: 4,
                borderWidth: selectedTextId === textOverlay.id ? 1 : 0,
                borderColor: 'rgba(255,255,255,0.5)',
              }}
            >
              <Text
                style={{
                  fontSize: textOverlay.fontSize,
                  color: textOverlay.color,
                  fontWeight: textOverlay.fontWeight,
                  textShadowColor: 'rgba(0,0,0,0.8)',
                  textShadowOffset: { width: 1, height: 1 },
                  textShadowRadius: 2,
                }}
              >
                {textOverlay.text}
              </Text>
            </View>
          </Animated.View>
        </GestureDetector>
      );
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <CameraView 
        ref={cameraRef}
        style={{ flex: 1 }} 
        facing={'back'}
        enableTorch={torchOn}
      />
      
      <SafeAreaView style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0,
        pointerEvents: 'box-none'
      }}>
        {/* Text Overlays */}
        {textOverlays.map((textOverlay) => {
          console.log('Rendering text overlay:', textOverlay.text, 'at position:', textOverlay.x, textOverlay.y);
          return <DraggableText key={`${textOverlay.id}-${textOverlay.isEditing}`} textOverlay={textOverlay} />;
        })}

        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16 }}>
            {/* Settings Button */}
            <TouchableOpacity 
              onPress={() => router.push('/(modals)/settings')}
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 }}
            >
              <Feather name="settings" size={24} color="white" />
            </TouchableOpacity>
            
            {/* Flash Toggle */}
            <TouchableOpacity 
              onPress={() => setTorchOn(!torchOn)} 
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 }}
            >
              <Feather name={torchOn ? 'zap' : 'zap-off'} size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Text Controls */}
          {textOverlays.length > 0 && (
            <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
                <TouchableOpacity
                  onPress={clearAllText}
                  style={{ backgroundColor: 'rgba(255,0,0,0.8)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}
                >
                  <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>Clear All</Text>
                </TouchableOpacity>
                
                {selectedTextId && (
                  <>
                    <TouchableOpacity
                      onPress={() => deleteTextOverlay(selectedTextId)}
                      style={{ backgroundColor: 'rgba(255,100,100,0.8)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>Delete</Text>
                    </TouchableOpacity>
                    

                    
                    {/* Font Size Controls */}
                    <TouchableOpacity
                      onPress={() => {
                        const text = textOverlays.find(t => t.id === selectedTextId);
                        if (text && text.fontSize > 12) {
                          updateTextOverlay(selectedTextId, { fontSize: text.fontSize - 2 });
                        }
                      }}
                      style={{ backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6 }}
                    >
                      <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>A-</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      onPress={() => {
                        const text = textOverlays.find(t => t.id === selectedTextId);
                        if (text && text.fontSize < 48) {
                          updateTextOverlay(selectedTextId, { fontSize: text.fontSize + 2 });
                        }
                      }}
                      style={{ backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6 }}
                    >
                      <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>A+</Text>
                    </TouchableOpacity>
                    
                    {/* Bold Toggle */}
                    <TouchableOpacity
                      onPress={() => {
                        const text = textOverlays.find(t => t.id === selectedTextId);
                        if (text) {
                          updateTextOverlay(selectedTextId, { 
                            fontWeight: text.fontWeight === 'bold' ? 'normal' : 'bold' 
                          });
                        }
                      }}
                      style={{ backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6 }}
                    >
                      <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>B</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
              
              {/* Color Picker for Selected Text */}
              {selectedTextId && (
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8, gap: 8 }}>
                  {textColors.map((color) => (
                    <TouchableOpacity
                      key={color}
                      onPress={() => updateTextOverlay(selectedTextId, { color })}
                      style={{
                        width: 24,
                        height: 24,
                        backgroundColor: color,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: textOverlays.find(t => t.id === selectedTextId)?.color === color ? '#FFD700' : 'rgba(255,255,255,0.5)',
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Bottom Controls */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16 }}>
            {/* Text Button */}
            <TouchableOpacity
              onPress={addTextOverlay}
              style={{
                backgroundColor: 'rgba(255,255,255,0.2)',
                borderRadius: 25,
                padding: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="type" size={24} color="white" />
            </TouchableOpacity>

            {/* Shutter Button */}
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

            {/* Placeholder for symmetry */}
            <View style={{ width: 48 }} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
} 