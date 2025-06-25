import { View, Text, TouchableOpacity, Alert, TextInput, StyleSheet, Image, ScrollView, Modal } from 'react-native'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Camera, CameraView, CameraType, FlashMode } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { mergePhotoWithText, applyImageFilter } from '../../lib/mergeWithSkia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { photoFilters, FilterConfig } from '../../lib/photoFilters';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

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
  const [pendingCapture, setPendingCapture] = useState(false);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterConfig>(photoFilters[0]);
  const [showFilters, setShowFilters] = useState(false);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const { user } = useAuth();
  const [postOptionsVisible, setPostOptionsVisible] = useState(false);

  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const cameraRef = useRef<CameraView>(null);
  const containerRef = useRef<View>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const insets = useSafeAreaInsets();

  // Text colors
  const textColors = ['#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];

  // Store captured uri from onLoadEnd capture
  const captureResultRef = useRef<string | undefined>(undefined);

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
      // De-select any other text
      setTextOverlays(currentOverlays =>
        currentOverlays.map(t =>
          t.id === id ? { ...t, isEditing: true } : { ...t, isEditing: false }
        )
      );
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
          <Feather
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
    setFlashMode(prev => (prev === 'off' ? 'on' : 'off'));
  }, []);

  const getFlashIcon = () => {
    return flashMode === 'on' ? 'zap' : 'zap-off';
  };

  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;
    
    if (!hasMediaLibraryPermission) {
      Alert.alert('Permission needed', 'Please grant media library access to save photos.');
      return;
    }

    try {
      setIsCapturing(true);
      
      // Capture text overlays length before modifying state
      const hasTextOverlays = textOverlays.length > 0;
      console.log('Debug: textOverlays.length =', textOverlays.length, 'hasTextOverlays =', hasTextOverlays);
      
      // Deselect any selected text to avoid UI conflicts during capture
      setSelectedTextId(null);
      
      console.log('Taking picture...');
      
      const photo = await cameraRef.current.takePictureAsync();

      if (!photo?.uri) {
        throw new Error('Failed to capture photo');
      }

      let finalUri = photo.uri;

      // If a filter is selected OR there are text overlays, we need to render the captured photo
      // with overlay/text and then snapshot the combined view. To avoid the race condition where the
      // snapshot occurs before the <Image> finishes decoding (resulting in a solid coloured frame),
      // we defer captureRef until the Image's onLoadEnd fires.
      if (selectedFilter.id !== 'none' || hasTextOverlays) {
        setCapturedPhoto(photo.uri);
        setPhotoLoaded(false);
        setControlsVisible(false);
        setPendingCapture(true);

        // Wait until onLoadEnd triggers the capture (with a safety timeout)
        await new Promise(res => setTimeout(res, 200));

        if (pendingCapture) {
          // onLoadEnd never fired within timeout — fall back
          console.warn('Image did not finish loading in time; using original photo');
          setPendingCapture(false);
        }

        // After onLoadEnd captures container, finalUri should be updated via ref
        // We store it in a ref so we can update here
        if ((captureResultRef.current)) {
          finalUri = captureResultRef.current;
          captureResultRef.current = undefined;
        }
        
        // Store finalUri and show post options modal
        setCapturedPhoto(finalUri);
        setPhotoLoaded(true);
        setPostOptionsVisible(true);
      } else {
        // No filter or text overlays - just show the original photo
        setCapturedPhoto(finalUri);
        setPhotoLoaded(true);
        setPostOptionsVisible(true);
      }
      
    } catch (error) {
      console.error('Error capturing photo:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [selectedFilter, isCapturing, hasMediaLibraryPermission, photoLoaded, containerRef, textOverlays]);

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
        enableTorch={flashMode==='on'}
      />
    );

    // Apply other overlays normally
    if (selectedFilter.overlayStyle) {
      // console.log(`Applying overlay for filter: ${selectedFilter.name}`, selectedFilter.overlayStyle); // removed for production
      
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

  const resetCamera = () => {
    setCapturedPhoto(null);
    setPostOptionsVisible(false);
    setControlsVisible(true);
  };

  const addStory = useCallback(async () => {
    if (!user || !capturedPhoto) { resetCamera(); return; }
    try {
      const fileUri = capturedPhoto;
      const fileExt = fileUri.split('.').pop()?.toLowerCase() || 'jpg';
      const arrayBuf = await fetch(fileUri).then(r => r.arrayBuffer());
      const path = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: upErr } = await supabase.storage.from('stories').upload(path, arrayBuf as any, {
        cacheControl: '3600',
        contentType: `image/${fileExt}`,
      });
      if (upErr && upErr.message !== 'The resource already exists') {
        console.warn('upload error', upErr);
        resetCamera();
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl(path);
      const { error: insErr } = await supabase.from('stories').insert({ user_id: user.id, media_url: publicUrl, media_type: 'image' });
      if (insErr) console.warn('insert story error', insErr);
    } catch (e) { console.warn('add story error', e); }
    resetCamera();
  }, [capturedPhoto, user]);

  const sendPhoto = () => {
    if (capturedPhoto) {
      router.push({ pathname: '/(modals)/send-to', params: { uri: capturedPhoto } } as any);
    }
    resetCamera();
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
    <>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View ref={containerRef} collapsable={false} style={{ flex: 1, backgroundColor: 'black' }}>
          <View 
            style={{ flex: 1 }} 
          >
            {capturedPhoto ? (
              <View style={{ flex: 1 }}>
                {selectedFilter.component ? (
                  <selectedFilter.component style={{ flex: 1 }}>
                    <Image 
                      source={{ uri: capturedPhoto }} 
                      style={{ flex: 1 }} 
                      resizeMode="cover" 
                      onLoadEnd={async () => {
                        setPhotoLoaded(true);
                        if (pendingCapture && containerRef.current) {
                          try {
                            const capturedUri = await captureRef(containerRef.current, {
                              format: 'jpg',
                              quality: 0.9,
                            });
                            captureResultRef.current = capturedUri;
                            console.log('Filtered image captured after load:', capturedUri);
                          } catch (err) {
                            console.warn('Failed to capture filtered image after load', err);
                          } finally {
                            setPendingCapture(false);
                          }
                        }
                      }}
                    />
                  </selectedFilter.component>
                ) : (
                  <Image 
                    source={{ uri: capturedPhoto }} 
                    style={{ flex: 1 }} 
                    resizeMode="cover" 
                    onLoadEnd={async () => {
                      setPhotoLoaded(true);
                      if (pendingCapture && containerRef.current) {
                        try {
                          const capturedUri = await captureRef(containerRef.current, {
                            format: 'jpg',
                            quality: 0.9,
                          });
                          captureResultRef.current = capturedUri;
                          console.log('Filtered image captured after load:', capturedUri);
                        } catch (err) {
                          console.warn('Failed to capture filtered image after load', err);
                        } finally {
                          setPendingCapture(false);
                        }
                      }
                    }}
                  />
                )}
                {/* Apply overlay for filters that use overlayStyle or B&W */}
                {selectedFilter.overlayStyle ? (
                  <View
                    style={{
                      ...selectedFilter.overlayStyle,
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                    }}
                  />
                ) : null}
              </View>
            ) : (
              renderFilteredCamera()
            )}
            
            {/* Post options are now displayed in a full-screen Modal, overlay removed */}
          </View>
          
          <SafeAreaView style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0,
            pointerEvents: 'box-none'
          }}>
            {/* Text overlays - always visible when not in editing mode or when capturing */}
            {(!postOptionsVisible || pendingCapture) && textOverlays.map((textOverlay) => (
              <DraggableText key={`${textOverlay.id}-${textOverlay.isEditing}`} textOverlay={textOverlay} />
            ))}

            { !postOptionsVisible && (
            <View style={{ flex: 1, justifyContent: 'space-between', opacity: controlsVisible ? 1 : 0 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16 }}>
                <TouchableOpacity 
                  onPress={() => router.push('/(modals)/settings')}
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 }}
                >
                  <Feather name="settings" size={24} color="white" />
                </TouchableOpacity>
                
                {/* Camera Flip Button */}
                <TouchableOpacity 
                  onPress={toggleCameraType}
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 }}
                >
                  <Feather name="refresh-ccw" size={24} color="white" />
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
                  <Feather name={getFlashIcon()} size={24} color="white" />
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
            )}
          </SafeAreaView>
        </View>
      </GestureHandlerRootView>

      {/* Full-screen modal for post options */}
      <Modal
        visible={postOptionsVisible}
        animationType="slide"
        onRequestClose={resetCamera}
        presentationStyle="fullScreen"
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          {capturedPhoto && (
            <Image
              source={{ uri: capturedPhoto }}
              style={{ flex: 1 }}
              resizeMode="contain"
            />
          )}

          <SafeAreaView
            style={{
              flexDirection: 'row',
              justifyContent: 'space-around',
              padding: 16,
              backgroundColor: 'rgba(0,0,0,0.9)',
            }}
          >
            <TouchableOpacity
              onPress={sendPhoto}
              style={{
                backgroundColor: '#1e90ff',
                paddingVertical: 12,
                paddingHorizontal: 24,
                borderRadius: 24,
              }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold' }}>Send To...</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={addStory}
              style={{
                backgroundColor: '#32c862',
                paddingVertical: 12,
                paddingHorizontal: 24,
                borderRadius: 24,
              }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold' }}>Add to Story</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={resetCamera} style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
              <Text style={{ color: 'white' }}>Cancel</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

    </>
  );
} 