import { View, Text, TouchableOpacity, Alert, TextInput, StyleSheet, Image, ScrollView } from 'react-native'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Camera, CameraView, CameraType, FlashMode } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { mergePhotoWithText, applyImageFilter } from '../../lib/mergeWithSkia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { photoFilters, FilterConfig } from '../../lib/photoFilters';

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
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterConfig>(photoFilters[0]);
  const [showFilters, setShowFilters] = useState(false);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');

  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const cameraRef = useRef<CameraView>(null);
  const containerRef = useRef<View>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const insets = useSafeAreaInsets();

  // Text colors
  const textColors = ['#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

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
    if (mediaLibraryPermission?.status === 'undetermined') {
      requestMediaLibraryPermission();
    }
  }, [mediaLibraryPermission?.status, requestMediaLibraryPermission]);

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



  const renderFilterPreview = (filter: FilterConfig) => {
    const isSelected = filter.id === selectedFilter.id;
    
    return (
      <TouchableOpacity
        key={filter.id}
        style={{
          alignItems: 'center',
          marginHorizontal: 8,
          opacity: isSelected ? 1 : 0.7,
        }}
        onPress={() => setSelectedFilter(filter)}
      >
        <View
          style={{
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: isSelected ? '#007AFF' : '#333',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 4,
            borderWidth: isSelected ? 2 : 0,
            borderColor: '#007AFF',
          }}
        >
          <Ionicons 
            name={filter.icon as any} 
            size={24} 
            color={isSelected ? 'white' : '#999'} 
          />
        </View>
        <Text
          style={{
            color: isSelected ? '#007AFF' : '#999',
            fontSize: 12,
            fontWeight: isSelected ? '600' : '400',
          }}
        >
          {filter.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const toggleCameraType = useCallback(() => {
    setCameraType(current => (current === 'back' ? 'front' : 'back'));
  }, []);

  const toggleFlash = useCallback(() => {
    setFlashMode(current => {
      switch (current) {
        case 'off': return 'on';
        case 'on': return 'auto';
        case 'auto': return 'off';
        default: return 'off';
      }
    });
  }, []);

  const getFlashIcon = () => {
    switch (flashMode) {
      case 'on': return 'flash';
      case 'auto': return 'flash-outline';
      case 'off': return 'flash-off';
      default: return 'flash-off';
    }
  };

  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;
    
    if (!hasMediaLibraryPermission) {
      Alert.alert('Permission needed', 'Please grant media library access to save photos.');
      return;
    }

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (!photo?.uri) {
        throw new Error('Failed to capture photo');
      }

      let finalUri = photo.uri;

      // Apply real filter if one is selected and has a component
      if (selectedFilter.component) {
        console.log(`Applying real ${selectedFilter.name} filter to captured photo...`);
        
        // Create a temporary image element to apply the filter
        setCapturedPhoto(photo.uri);
        setPhotoLoaded(false);
        
        // Wait for the image to load so we can capture it with the filter applied
        await Promise.race([
          new Promise(resolve => {
            const checkLoaded = () => {
              if (photoLoaded) {
                resolve(true);
              } else {
                setTimeout(checkLoaded, 50);
              }
            };
            checkLoaded();
          }),
          new Promise(res => setTimeout(res, 2000)) // 2 second timeout
        ]);

        // Capture the filtered image using view-shot
        if (containerRef.current) {
          try {
            const filteredUri = await captureRef(containerRef.current, {
              format: 'jpg',
              quality: 0.9,
            });
            finalUri = filteredUri;
            console.log(`Filter applied successfully. Filtered: ${filteredUri}`);
          } catch (error) {
            console.warn('Failed to capture filtered image, using original:', error);
          }
        }
      }

      // Save to media library
      const asset = await MediaLibrary.createAssetAsync(finalUri);
      console.log('Photo saved:', asset.uri);
      
      Alert.alert(
        'Photo Saved!', 
        `Photo saved with ${selectedFilter.name} filter`,
        [{ 
          text: 'OK', 
          onPress: () => setCapturedPhoto(null) // Clear the captured photo
        }]
      );
      
    } catch (error) {
      console.error('Error capturing photo:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [selectedFilter, isCapturing, hasMediaLibraryPermission, photoLoaded, containerRef]);

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

  const renderFilteredCamera = () => {
    // For live camera preview, we'll use overlays since color matrix filters don't work with CameraView
    // The real filters will be applied to captured photos
    const cameraView = (
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={cameraType}
        flash={flashMode}
      />
    );

    // Always return camera with potential overlay - real filters applied on capture
    if (selectedFilter.overlayStyle) {
      return (
        <View style={{ flex: 1 }}>
          {cameraView}
          <View
            style={{
              ...selectedFilter.overlayStyle,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
            }}
          />
        </View>
      );
    }

    return cameraView;
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
          onPress={async () => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setHasPermission(status === 'granted');
          }}
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View ref={containerRef} collapsable={false} style={{ flex: 1, backgroundColor: 'black' }}>
        <TouchableOpacity 
          style={{ flex: 1 }} 
          activeOpacity={1}
          onPress={dismissAllEditing}
        >
          {capturedPhoto ? (
            selectedFilter.component ? (
              <selectedFilter.component style={{ flex: 1 }}>
                <Image 
                  source={{ uri: capturedPhoto }} 
                  style={{ flex: 1 }} 
                  resizeMode="cover" 
                  onLoadEnd={() => setPhotoLoaded(true)}
                />
              </selectedFilter.component>
            ) : (
              <Image 
                source={{ uri: capturedPhoto }} 
                style={{ flex: 1 }} 
                resizeMode="cover" 
                onLoadEnd={() => setPhotoLoaded(true)}
              />
            )
          ) : (
            renderFilteredCamera()
          )}
          
          {/* No additional overlay needed - filters handled in renderFilteredCamera */}
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
              {selectedFilter.id !== 'none' && (
                <View style={{ 
                  backgroundColor: 'rgba(0,0,0,0.6)', 
                  borderRadius: 15, 
                  paddingHorizontal: 12, 
                  paddingVertical: 6,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                    {selectedFilter.name}
                  </Text>
                </View>
              )}
              
              <TouchableOpacity 
                onPress={toggleFlash} 
                style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 }}
              >
                <Ionicons name={getFlashIcon()} size={24} color="white" />
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
                onPress={capturePhoto}
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
                  {photoFilters.map(renderFilterPreview)}
                </ScrollView>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </GestureHandlerRootView>
  );
} 