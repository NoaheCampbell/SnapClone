import { View, Text, TouchableOpacity, Alert, TextInput, Image, ScrollView, Modal } from 'react-native'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Camera, CameraView, CameraType, FlashMode } from 'expo-camera';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { photoFilters, FilterConfig } from '../lib/photoFilters';

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

interface SprintCameraProps {
  onCapture: (uri: string) => void;
  onCancel: () => void;
}

// Draggable text component - moved outside to prevent recreation
const DraggableText = React.memo(({ textOverlay, updateTextOverlay, startEditingText, finishEditingText, selectedTextId, currentEditingTextRef }: { 
  textOverlay: TextOverlay;
  updateTextOverlay: (id: string, updates: Partial<TextOverlay>) => void;
  startEditingText: (id: string) => void;
  finishEditingText: (id: string, newText: string) => void;
  selectedTextId: string | null;
  currentEditingTextRef: React.MutableRefObject<{ id: string; text: string } | null>;
}) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      if (!isDragging.value) {
        runOnJS(startEditingText)(textOverlay.id);
      }
    });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const { translationX, translationY } = event;
      const newX = Math.max(0, Math.min(400, textOverlay.x + translationX));
      const newY = Math.max(50, Math.min(700, textOverlay.y + translationY));

      runOnJS(updateTextOverlay)(textOverlay.id, {
        x: newX,
        y: newY,
      });

      translateX.value = 0;
      translateY.value = 0;
      isDragging.value = false;
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
        <EditableTextInput textOverlay={textOverlay} onFinishEditing={finishEditingText} currentEditingTextRef={currentEditingTextRef} />
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
              textAlign: 'center',
            }}
          >
            {textOverlay.text}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

// Editable text component - also moved outside
const EditableTextInput = React.memo(({ textOverlay, onFinishEditing, currentEditingTextRef }: { 
  textOverlay: TextOverlay;
  onFinishEditing: (id: string, newText: string) => void;
  currentEditingTextRef: React.MutableRefObject<{ id: string; text: string } | null>;
}) => {
  const [localText, setLocalText] = useState(textOverlay.text);
  const textInputRef = useRef<TextInput>(null);

  useEffect(() => {
    setLocalText(textOverlay.text);
    // Update the ref with current editing state
    currentEditingTextRef.current = { id: textOverlay.id, text: textOverlay.text };
  }, [textOverlay.text, textOverlay.id, currentEditingTextRef]);

  const handleTextChange = (text: string) => {
    setLocalText(text);
    // Update the ref with current text
    currentEditingTextRef.current = { id: textOverlay.id, text };
  };

  const handleFinish = () => {
    onFinishEditing(textOverlay.id, localText);
    currentEditingTextRef.current = null;
  };

  // Force blur when component is about to unmount or editing ends
  useEffect(() => {
    return () => {
      if (textInputRef.current) {
        textInputRef.current.blur();
      }
    };
  }, []);

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
        ref={textInputRef}
        value={localText}
        onChangeText={handleTextChange}
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
});

export default function SprintCamera({ onCapture, onCancel }: SprintCameraProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [isCapturing, setIsCapturing] = useState(false);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterConfig>(photoFilters[0]);
  const [showFilters, setShowFilters] = useState(false);
  const [postOptionsVisible, setPostOptionsVisible] = useState(false);
  const [pendingCapture, setPendingCapture] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  
  const cameraRef = useRef<CameraView>(null);
  const containerRef = useRef<View>(null);
  const captureAreaRef = useRef<View>(null);
  const captureResultRef = useRef<string | undefined>(undefined);
  const currentEditingTextRef = useRef<{ id: string; text: string } | null>(null);
  const isEditingRef = useRef(false);

  // Text colors
  const textColors = ['#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

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

  const updateTextOverlay = useCallback((id: string, updates: Partial<TextOverlay>) => {
    setTextOverlays(prev => prev.map(text => 
      text.id === id ? { ...text, ...updates } : text
    ));
  }, []);

  const startEditingText = (id: string) => {
    const text = textOverlays.find(t => t.id === id);
    if (text) {
      isEditingRef.current = true;
      setTextOverlays(currentOverlays =>
        currentOverlays.map(t =>
          t.id === id ? { ...t, isEditing: true } : { ...t, isEditing: false }
        )
      );
      setSelectedTextId(id);
    }
  };

  const finishEditingText = (id: string, newText: string) => {
    isEditingRef.current = false;
    updateTextOverlay(id, { 
      text: newText.trim() || 'Text', 
      isEditing: false 
    });
    setSelectedTextId(null);
  };

  const dismissAllEditing = () => {
    // Find any text that's currently being edited and save it
    const editingOverlay = textOverlays.find(overlay => overlay.isEditing);
    if (editingOverlay && currentEditingTextRef.current) {
      // Save the current text from the ref before dismissing
      const { id, text } = currentEditingTextRef.current;
      setTextOverlays(prev => prev.map(overlay => 
        overlay.id === id 
          ? { ...overlay, text: text.trim() || 'Text', isEditing: false }
          : { ...overlay, isEditing: false }
      ));
    } else {
      // No editing text, just dismiss
      setTextOverlays(textOverlays.map(text => ({
        ...text,
        isEditing: false
      })));
    }
    
    isEditingRef.current = false;
    currentEditingTextRef.current = null;
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

  const backgroundTapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(dismissAllEditing)();
    });

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
            size={20} 
            color="white" 
          />
        </View>
        <Text style={{ color: 'white', fontSize: 10, textAlign: 'center' }}>
          {filter.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const toggleCameraType = () => {
    setCameraType(current => (current === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = () => {
    setFlashMode(prev => (prev === 'off' ? 'on' : 'off'));
  };

  const capturePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      const hasTextOverlays = textOverlays.length > 0;
      
      // Deselect any selected text to avoid UI conflicts during capture
      setSelectedTextId(null);
      
      const photo = await cameraRef.current.takePictureAsync();

      if (!photo?.uri) {
        throw new Error('Failed to capture photo');
      }

      let finalUri = photo.uri;

      // If a filter is selected OR there are text overlays, capture the combined view
      if (selectedFilter.id !== 'none' || hasTextOverlays) {
        setCapturedPhoto(photo.uri);
        setPhotoLoaded(false);
        setPendingCapture(true);

        // Wait for image to load and capture
        await new Promise(res => setTimeout(res, 200));

        if (captureResultRef.current) {
          finalUri = captureResultRef.current;
          captureResultRef.current = undefined;
        }

        setCapturedPhoto(finalUri);
        setPhotoLoaded(true);
        setPostOptionsVisible(true);
      } else {
        // No filter or text overlays - show the original photo
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
  };

  const resetCamera = () => {
    setCapturedPhoto(null);
    setPostOptionsVisible(false);
  };

  const usePhoto = () => {
    if (capturedPhoto) {
      onCapture(capturedPhoto);
    }
    resetCamera();
  };

  const renderFilteredCamera = () => {
    const cameraView = (
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={cameraType}
        flash={flashMode}
      />
    );

    // Apply filter overlays
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
    return (
      <View style={{ flex: 1, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'white' }}>Loading camera...</Text>
      </View>
    );
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
          <GestureDetector gesture={backgroundTapGesture}>
            <View style={{ flex: 1 }}>
              {/* Capture Area - only this content will be captured */}
              <View ref={captureAreaRef} collapsable={false} style={{ flex: 1 }}>
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
                            if (pendingCapture && captureAreaRef.current) {
                              try {
                                const capturedUri = await captureRef(captureAreaRef.current, {
                                  format: 'jpg',
                                  quality: 0.9,
                                });
                                captureResultRef.current = capturedUri;
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
                          if (pendingCapture && captureAreaRef.current) {
                            try {
                              const capturedUri = await captureRef(captureAreaRef.current, {
                                format: 'jpg',
                                quality: 0.9,
                              });
                              captureResultRef.current = capturedUri;
                            } catch (err) {
                              console.warn('Failed to capture filtered image after load', err);
                            } finally {
                              setPendingCapture(false);
                            }
                          }
                        }}
                      />
                    )}
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
                
                {/* Text overlays - move inside capture area */}
                {(!postOptionsVisible || pendingCapture) && textOverlays.map((textOverlay) => (
                  <DraggableText 
                    key={textOverlay.id} 
                    textOverlay={textOverlay}
                    updateTextOverlay={updateTextOverlay}
                    startEditingText={startEditingText}
                    finishEditingText={finishEditingText}
                    selectedTextId={selectedTextId}
                    currentEditingTextRef={currentEditingTextRef}
                  />
                ))}
              </View>
            </View>
          </GestureDetector>
          
          <SafeAreaView style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0,
            pointerEvents: 'box-none'
          }}>
            {/* UI Controls - these are outside capture area */}
            {!postOptionsVisible && (
              <View style={{ flex: 1, justifyContent: 'space-between' }}>
                {/* Top Controls */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16 }}>
                  <TouchableOpacity 
                    onPress={onCancel}
                    style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 }}
                  >
                    <Feather name="x" size={24} color="white" />
                  </TouchableOpacity>
                  
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
                    <Feather name={flashMode === 'on' ? 'zap' : 'zap-off'} size={24} color="white" />
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
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 60 }}>
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
                    bottom: 160, 
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

      {/* Post-capture modal */}
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
              onPress={usePhoto}
              style={{
                backgroundColor: '#32c862',
                paddingVertical: 12,
                paddingHorizontal: 24,
                borderRadius: 24,
              }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold' }}>Use Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={resetCamera} style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
              <Text style={{ color: 'white' }}>Retake</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
} 