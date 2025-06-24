import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';

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

export default function StoriesScreen() {
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const addTextOverlay = () => {
    console.log('Adding new text overlay');
    const newText: TextOverlay = {
      id: Date.now().toString(),
      text: 'Test Text',
      x: 150,
      y: 200,
      fontSize: 24,
      color: '#000000',
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
    console.log('startEditingText called for id:', id);
    const text = textOverlays.find(t => t.id === id);
    if (text) {
      console.log('Found text to edit:', text.text);
      setEditingText(text.text);
      updateTextOverlay(id, { isEditing: true });
      setSelectedTextId(id);
    }
  };

  const finishEditingText = (id: string) => {
    updateTextOverlay(id, { 
      text: editingText.trim() || 'Test Text', 
      isEditing: false 
    });
    setEditingText('');
  };

  const DraggableText = ({ textOverlay }: { textOverlay: TextOverlay }) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

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

        const isTap = Math.abs(translationX) < 5 && Math.abs(translationY) < 5;
        console.log('Is tap detected:', isTap);
        if (isTap) {
          console.log('Starting edit for text overlay:', textOverlay.id);
          runOnJS(startEditingText)(textOverlay.id);
        }

        translateX.value = 0;
        translateY.value = 0;
      });

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
              backgroundColor: 'rgba(255,255,255,0.9)',
              borderRadius: 8,
              borderWidth: 2,
              borderColor: '#007AFF',
              minWidth: 100,
            }}
          >
            <TextInput
              value={editingText}
              onChangeText={setEditingText}
              onBlur={() => finishEditingText(textOverlay.id)}
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
            />
          </View>
        </Animated.View>
      );
    }

    return (
      <GestureDetector gesture={panGesture}>
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
              backgroundColor: selectedTextId === textOverlay.id ? 'rgba(0,0,255,0.2)' : 'rgba(255,255,255,0.1)',
              borderRadius: 4,
              borderWidth: selectedTextId === textOverlay.id ? 2 : 0,
              borderColor: '#007AFF',
            }}
          >
            <Text
              style={{
                fontSize: textOverlay.fontSize,
                color: textOverlay.color,
                fontWeight: textOverlay.fontWeight,
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
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 24, textAlign: 'center', margin: 20, color: 'black' }}>
          Text Overlay Test
        </Text>
        
        {/* Test background area */}
        <View 
          style={{ 
            flex: 1, 
            backgroundColor: '#f0f0f0', 
            margin: 20, 
            borderRadius: 10,
            position: 'relative'
          }}
          onTouchStart={(event) => {
            console.log('Background touched at:', event.nativeEvent.locationX, event.nativeEvent.locationY);
          }}
        >
          {/* Render text overlays */}
          {textOverlays.map((textOverlay) => (
            <DraggableText key={textOverlay.id} textOverlay={textOverlay} />
          ))}
        </View>
        
        {/* Add text button */}
        <TouchableOpacity
          onPress={addTextOverlay}
          style={{
            backgroundColor: '#007AFF',
            padding: 15,
            margin: 20,
            borderRadius: 10,
            alignItems: 'center'
          }}
        >
          <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
            Add Text Overlay
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
