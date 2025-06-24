import { View, Text, TouchableOpacity, Alert, TextInput, StyleSheet, Image, ScrollView } from 'react-native'
import React, { useState, useEffect, useRef } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { mergePhotoWithText, applyImageFilter } from '../../lib/mergeWithSkia';

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

interface ColorFilter {
  id: string;
  name: string;
  style: any;
  icon: string;
}

const colorFilters: ColorFilter[] = [
  {
    id: 'none',
    name: 'None',
    style: {},
    icon: 'circle'
  },
  {
    id: 'bw',
    name: 'B&W',
    style: {
      // Will be handled specially in getFilterOverlay
    },
    icon: 'square'
  },
  {
    id: 'sepia',
    name: 'Sepia',
    style: {
      tintColor: '#8B4513',
      opacity: 0.6,
    },
    icon: 'sun'
  },
  {
    id: 'cool',
    name: 'Cool',
    style: {
      tintColor: '#4A90E2',
      opacity: 0.3,
    },
    icon: 'droplet'
  },
  {
    id: 'warm',
    name: 'Warm',
    style: {
      tintColor: '#FF6B35',
      opacity: 0.3,
    },
    icon: 'thermometer'
  },
  {
    id: 'vintage',
    name: 'Vintage',
    style: {
      tintColor: '#D4A574',
      opacity: 0.4,
    },
    icon: 'camera'
  },
  {
    id: 'dramatic',
    name: 'Drama',
    style: {
      tintColor: '#8B0000',
      opacity: 0.4,
    },
    icon: 'zap'
  },
  {
    id: 'neon',
    name: 'Neon',
    style: {
      tintColor: '#00FFFF',
      opacity: 0.3,
    },
    icon: 'star'
  },
  {
    id: 'sunset',
    name: 'Sunset',
    style: {
      tintColor: '#FF4500',
      opacity: 0.35,
    },
    icon: 'sunset'
  },
  {
    id: 'noir',
    name: 'Noir',
    style: {
      tintColor: '#000000',
      opacity: 0.5,
    },
    icon: 'moon'
  }
];

export default function CameraScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [hasMediaLibraryPermission, setHasMediaLibraryPermission] = useState<boolean | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('none');
  const [showFilters, setShowFilters] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const cameraRef = useRef<CameraView>(null);
  const containerRef = useRef<View>(null);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Text colors
  const textColors = ['#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];

  useEffect(() => {
    if (permission?.granted) {
      setHasPermission(true);
    } else if (permission?.status === 'undetermined') {
      setHasPermission(null);
    } else {
      setHasPermission(false);
    }
  }, [permission]);

  useEffect(() => {
    if (mediaLibraryPermission?.granted) {
      setHasMediaLibraryPermission(true);
    } else if (mediaLibraryPermission?.status === 'undetermined') {
      setHasMediaLibraryPermission(null);
    } else {
      setHasMediaLibraryPermission(false);
    }
  }, [mediaLibraryPermission]);

  useEffect(() => {
    if (permission?.status === 'undetermined') {
      requestPermission();
    }
    if (mediaLibraryPermission?.status === 'undetermined') {
      requestMediaLibraryPermission();
    }
  }, [permission?.status, mediaLibraryPermission?.status, requestPermission, requestMediaLibraryPermission]);

  const addTextOverlay = () => {
    const newText: TextOverlay = {
      id: Date.now().toString(),
      text: 'Text',
      x: 200,
      y: 300,
      fontSize: 24,
      color: '#FFFFFF',
      fontWeight: 'normal',
      isEditing: false
    };
    setTextOverlays([...textOverlays, newText]);
    setSelectedTextId(newText.id);
  };

  const updateTextOverlay = (id: string, updates: Partial<TextOverlay>) => {
    setTextOverlays(textOverlays.map(text => 
      text.id === id ? { ...text, ...updates } : text
    ));
  };

  const startEditingText = (id: string) => {
    const text = textOverlays.find(t => t.id === id);
    if (text) {
      updateTextOverlay(id, { isEditing: true });
      setSelectedTextId(id);
    }
  };

  const finishEditingText = (id: string, newText: string) => {
    updateTextOverlay(id, { 
      text: newText.trim() || 'Text', 
      isEditing: false 
    });
    setSelectedTextId(null);
  };

  const dismissAllEditing = () => {
    setTextOverlays(textOverlays.map(text => ({
      ...text,
      isEditing: false
    })));
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

  const getFilterOverlay = () => {
    const filter = colorFilters.find(f => f.id === selectedFilter);
    if (!filter || filter.id === 'none') return null;

    if (filter.id === 'bw') {
      // Better B&W effect using multiple layers
      return (
        <>
          {/* Base desaturation */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '#808080',
              opacity: 0.7,
            }}
            pointerEvents="none"
          />
          {/* Contrast enhancement */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '#FFFFFF',
              opacity: 0.2,
            }}
            pointerEvents="none"
          />
        </>
      );
    }

    return (
      <View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: filter.style.tintColor || 'transparent',
            opacity: filter.style.opacity || 0.3,
          }
        ]}
        pointerEvents="none"
      />
    );
  };

  const renderFilterButton = (filter: ColorFilter) => (
    <TouchableOpacity
      key={filter.id}
      onPress={() => {
        setSelectedFilter(filter.id);
        setShowFilters(false);
      }}
      style={{
        alignItems: 'center',
        marginHorizontal: 8,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          width: 50,
          height: 50,
          borderRadius: 25,
          backgroundColor: selectedFilter === filter.id ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: selectedFilter === filter.id ? 2 : 1,
          borderColor: selectedFilter === filter.id ? '#FFD700' : 'rgba(255,255,255,0.3)',
        }}
      >
        <Feather name={filter.icon as any} size={20} color="white" />
        {filter.id !== 'none' && filter.id !== 'invert' && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 25,
              backgroundColor: filter.style.tintColor,
              opacity: filter.style.opacity * 0.7,
            }}
          />
        )}
      </View>
      <Text style={{ color: 'white', fontSize: 10, marginTop: 4, textAlign: 'center' }}>
        {filter.name}
      </Text>
    </TouchableOpacity>
  );

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
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });

      if (!photo?.uri) {
        throw new Error('Failed to capture photo');
      }

      let processedUri = photo.uri;

      // Temporarily disable Skia processing until we can debug it properly
      if (false && selectedFilter === 'bw') {
        try {
          console.log(`Applying ${selectedFilter} filter using Skia...`);
          processedUri = await applyImageFilter(
            photo.uri, 
            selectedFilter, 
            photo.width || 1920, 
            photo.height || 1080
          );
          console.log(`Filter applied successfully. Original: ${photo.uri}, Filtered: ${processedUri}`);
        } catch (filterError) {
          console.warn('Skia filter failed, falling back to overlay method:', filterError);
          // Fall back to overlay method if Skia fails
        }
      } else {
        console.log(`Using overlay method for filter: ${selectedFilter}`);
      }

      // Hide UI controls so they don't appear in the snapshot
      setControlsVisible(false);

      // Render the processed photo inside the view hierarchy so view-shot can grab it
      setCapturedPhoto(processedUri);
      setPhotoLoaded(false);
      // Wait until Image onLoadEnd fires (max 500ms fallback)
      await Promise.race([
        new Promise<void>((res) => {
          const check = () => {
            if (photoLoaded) return res();
            requestAnimationFrame(check);
          };
          check();
        }),
        new Promise(res => setTimeout(res, 500))
      ]);

      let finalUri = processedUri;

      if (textOverlays.length > 0 && containerRef.current) {
        try {
          finalUri = await captureRef(containerRef.current, {
            format: 'png',
            quality: 1,
          });
        } catch (e) {
          console.warn('view-shot merge failed', e);
        }
      }

      await MediaLibrary.saveToLibraryAsync(finalUri);
      
      Alert.alert(
        'Photo Saved! 📸',
        textOverlays.length > 0 ? 'Photo with text saved!' : 'Your snap is in your camera roll.',
        [{ text: 'OK' }]
      );

      // Reset
      setCapturedPhoto(null);
      setControlsVisible(true);
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

  // Editable text component
  const EditableTextInput = ({ textOverlay }: { textOverlay: TextOverlay }) => {
    const [localText, setLocalText] = useState(textOverlay.text);

    const handleFinish = () => {
      finishEditingText(textOverlay.id, localText);
    };

    return (
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
          value={localText}
          onChangeText={setLocalText}
          onBlur={handleFinish}
          onSubmitEditing={handleFinish}
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
    );
  };

  // Draggable text component
  const DraggableText = ({ textOverlay }: { textOverlay: TextOverlay }) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

    const tapGesture = Gesture.Tap()
      .onEnd(() => {
        runOnJS(startEditingText)(textOverlay.id);
      });

    const panGesture = Gesture.Pan()
      .onUpdate((event) => {
        translateX.value = event.translationX;
        translateY.value = event.translationY;
      })
      .onEnd((event) => {
        const { translationX, translationY } = event;

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
          <EditableTextInput textOverlay={textOverlay} />
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
              backgroundColor: selectedTextId === textOverlay.id ? 'rgba(255,255,255,0.2)' : 'transparent',
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View ref={containerRef} collapsable={false} style={{ flex: 1, backgroundColor: 'black' }}>
        <TouchableOpacity 
          style={{ flex: 1 }} 
          activeOpacity={1}
          onPress={dismissAllEditing}
        >
          {capturedPhoto ? (
            <Image 
              source={{ uri: capturedPhoto }} 
              style={{ flex: 1 }} 
              resizeMode="cover" 
              onLoadEnd={() => setPhotoLoaded(true)}
            />
          ) : (
            <CameraView 
              ref={cameraRef}
              style={{ flex: 1 }} 
              facing={'back'}
              enableTorch={torchOn}
            />
          )}
          
          {/* Filter Overlay */}
          {getFilterOverlay()}
        </TouchableOpacity>
        
        <SafeAreaView style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0,
          pointerEvents: 'box-none'
        }}>
          {/* Text overlays */}
          {textOverlays.map((textOverlay) => (
            <DraggableText key={`${textOverlay.id}-${textOverlay.isEditing}`} textOverlay={textOverlay} />
          ))}

          <View style={{ flex: 1, justifyContent: 'space-between', opacity: controlsVisible ? 1 : 0 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16 }}>
              <TouchableOpacity 
                onPress={() => router.push('/(modals)/settings')}
                style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 }}
              >
                <Feather name="settings" size={24} color="white" />
              </TouchableOpacity>
              
              {/* Filter Indicator */}
              {selectedFilter !== 'none' && (
                <View style={{ 
                  backgroundColor: 'rgba(0,0,0,0.6)', 
                  borderRadius: 15, 
                  paddingHorizontal: 12, 
                  paddingVertical: 6,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                    {colorFilters.find(f => f.id === selectedFilter)?.name}
                  </Text>
                </View>
              )}
              
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

              {/* Filter Button */}
              <TouchableOpacity
                onPress={() => setShowFilters(!showFilters)}
                style={{
                  backgroundColor: showFilters ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.2)',
                  borderRadius: 25,
                  padding: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="filter" size={24} color="white" />
              </TouchableOpacity>
            </View>

            {/* Filter Selection */}
            {showFilters && (
              <View style={{ 
                position: 'absolute', 
                bottom: 120, 
                left: 0, 
                right: 0, 
                backgroundColor: 'rgba(0,0,0,0.7)', 
                paddingVertical: 10 
              }}>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16 }}
                >
                  {colorFilters.map(renderFilterButton)}
                </ScrollView>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </GestureHandlerRootView>
  );
} 