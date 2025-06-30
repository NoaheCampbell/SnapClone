import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Dimensions, Animated, Modal, ScrollView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NEON_GREEN = '#00FF41';
const TUTORIAL_KEY = 'tutorial_completed';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetRef?: React.RefObject<any>;
  targetPosition?: { x: number; y: number; width: number; height: number };
  highlightPadding?: number;
  placement?: 'top' | 'bottom' | 'center';
  customHighlight?: boolean;
}

interface TutorialOverlayProps {
  steps: TutorialStep[];
  onComplete: () => void;
  isVisible: boolean;
}

export default function TutorialOverlay({ steps, onComplete, isVisible }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetMeasurements, setTargetMeasurements] = useState<any>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const pulseScaleAnim = useRef(new Animated.Value(1)).current;

  // Check if tutorial was already completed
  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_KEY).then((value) => {
      if (value === 'true' && isVisible) {
        onComplete();
      }
    });
  }, []);

  // Animate in when visible
  useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();

      // Start pulse animation for highlight
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.8,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScaleAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseScaleAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
      pulseAnim.setValue(0.3);
      pulseScaleAnim.setValue(1);
    }
  }, [isVisible]);

  // Measure target element when step changes
  useEffect(() => {
    const step = steps[currentStep];
    
    // Reset measurements first
    setTargetMeasurements(null);
    
    // Small delay to ensure elements are rendered
    const timer = setTimeout(() => {
      if (step?.targetRef?.current && !step.customHighlight) {
        step.targetRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
          if (width > 0 && height > 0) {
            console.log('Measured element:', step.id, { x, y, width, height });
            setTargetMeasurements({ x, y, width, height });
          }
        });
      } else if (step?.targetPosition) {
        setTargetMeasurements(step.targetPosition);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [currentStep, steps]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTutorial();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    completeTutorial();
  };

  const completeTutorial = async () => {
    await AsyncStorage.setItem(TUTORIAL_KEY, 'true');
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onComplete();
    });
  };

  if (!isVisible) return null;

  const step = steps[currentStep];
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <Modal transparent visible={isVisible} animationType="none">
      <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
        {/* Dark overlay with cutout */}
        {targetMeasurements && !step.customHighlight ? (
          <>
            {/* Dark overlay sections */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              {/* Top overlay */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: targetMeasurements.y - (step.highlightPadding || 12),
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                }}
              />
              {/* Left overlay */}
              <View
                style={{
                  position: 'absolute',
                  top: targetMeasurements.y - (step.highlightPadding || 12),
                  left: 0,
                  width: targetMeasurements.x - (step.highlightPadding || 12),
                  height: targetMeasurements.height + (step.highlightPadding || 12) * 2,
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                }}
              />
              {/* Right overlay */}
              <View
                style={{
                  position: 'absolute',
                  top: targetMeasurements.y - (step.highlightPadding || 12),
                  left: targetMeasurements.x + targetMeasurements.width + (step.highlightPadding || 12),
                  right: 0,
                  height: targetMeasurements.height + (step.highlightPadding || 12) * 2,
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                }}
              />
              {/* Bottom overlay */}
              <View
                style={{
                  position: 'absolute',
                  top: targetMeasurements.y + targetMeasurements.height + (step.highlightPadding || 12),
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                }}
              />
            </View>
            
            {/* Animated highlight layers */}
            {/* Outer glow effect */}
            <Animated.View
              style={{
                position: 'absolute',
                left: targetMeasurements.x - (step.highlightPadding || 12) - 12,
                top: targetMeasurements.y - (step.highlightPadding || 12) - 12,
                width: targetMeasurements.width + (step.highlightPadding || 12) * 2 + 24,
                height: targetMeasurements.height + (step.highlightPadding || 12) * 2 + 24,
                borderRadius: 16,
                backgroundColor: '#3B82F6',
                opacity: pulseAnim.interpolate({
                  inputRange: [0.3, 0.8],
                  outputRange: [0.2, 0.4],
                }),
                transform: [{ scale: pulseScaleAnim }],
              }}
            />
            
            {/* Middle glow layer */}
            <View
              style={{
                position: 'absolute',
                left: targetMeasurements.x - (step.highlightPadding || 12) - 8,
                top: targetMeasurements.y - (step.highlightPadding || 12) - 8,
                width: targetMeasurements.width + (step.highlightPadding || 12) * 2 + 16,
                height: targetMeasurements.height + (step.highlightPadding || 12) * 2 + 16,
                borderRadius: 12,
                backgroundColor: '#3B82F6',
                opacity: 0.3,
              }}
            />
            
            {/* Inner border */}
            <View
              style={{
                position: 'absolute',
                left: targetMeasurements.x - (step.highlightPadding || 12) - 4,
                top: targetMeasurements.y - (step.highlightPadding || 12) - 4,
                width: targetMeasurements.width + (step.highlightPadding || 12) * 2 + 8,
                height: targetMeasurements.height + (step.highlightPadding || 12) * 2 + 8,
                borderRadius: 8,
                borderWidth: 3,
                borderColor: '#3B82F6',
                backgroundColor: 'transparent',
              }}
            />
            
            {/* Pulsing border overlay */}
            <Animated.View
              style={{
                position: 'absolute',
                left: targetMeasurements.x - (step.highlightPadding || 12) - 4,
                top: targetMeasurements.y - (step.highlightPadding || 12) - 4,
                width: targetMeasurements.width + (step.highlightPadding || 12) * 2 + 8,
                height: targetMeasurements.height + (step.highlightPadding || 12) * 2 + 8,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: '#3B82F6',
                backgroundColor: 'transparent',
                opacity: pulseAnim,
              }}
            />
          </>
        ) : (
          <View className="absolute inset-0 bg-black/60" />
        )}
        
        {/* Tutorial card */}
        <View 
          className="absolute left-6 right-6"
          style={{
            top: step.placement === 'top' ? 60 : 
                 step.placement === 'center' ? screenHeight / 2 - 150 :
                 targetMeasurements && targetMeasurements.y < screenHeight / 2 ? 
                   targetMeasurements.y + targetMeasurements.height + (step.highlightPadding || 12) + 20 : 
                   60,
          }}
        >
          <View className="bg-white rounded-2xl shadow-lg" style={{ maxWidth: 400 }}>
            {/* Header with Progress dots and Skip */}
            <View className="flex-row justify-between items-center px-5 pt-4 pb-1">
              {/* Progress dots */}
              <View className="flex-row items-center">
                {steps.map((_, index) => (
                  <View
                    key={index}
                    className={`rounded-full mx-0.5 ${
                      index === currentStep 
                        ? 'w-2 h-2 bg-blue-500' 
                        : 'w-1.5 h-1.5 bg-gray-300'
                    }`}
                  />
                ))}
              </View>
              
              {/* Skip button */}
              <TouchableOpacity
                onPress={handleSkip}
                className="py-1"
              >
                <Text className="text-gray-500 text-base">Skip</Text>
              </TouchableOpacity>
            </View>
            
            {/* Content */}
            <View className="px-6 pb-5 pt-2">
              {/* Title */}
              <Text className="text-xl font-bold text-gray-900 mb-3">
                {step.title}
              </Text>
              
              {/* Description */}
              <Text className="text-base text-gray-600 leading-relaxed mb-5">
                {step.description}
              </Text>
              
              {/* Navigation */}
              <View className="flex-row items-center justify-between">
                {/* Previous button */}
                <TouchableOpacity
                  onPress={handlePrevious}
                  className={`px-4 py-2 ${currentStep === 0 ? 'opacity-0' : ''}`}
                  disabled={currentStep === 0}
                >
                  <Text className="text-blue-500 text-base">Previous</Text>
                </TouchableOpacity>
                
                {/* Next/Action button */}
                <TouchableOpacity
                  onPress={handleNext}
                  className="px-6 py-2.5 bg-blue-500 rounded-full"
                >
                  <Text className="text-white text-base font-medium">
                    {isLastStep ? 'Get Started' : 'Continue'}
                  </Text>
                </TouchableOpacity>
                
                {/* Placeholder for right side */}
                <View className={`px-4 py-2 ${currentStep === 0 ? '' : 'opacity-0'}`}>
                  <Text className="text-blue-500 text-base">Previous</Text>
                </View>
              </View>
              
              {/* Tap highlighted area text - only show when there's a highlight */}
              {targetMeasurements && !step.customHighlight && (
                <Text className="text-gray-400 text-sm text-center mt-3">
                  Tap highlighted area
                </Text>
              )}
            </View>
          </View>
        </View>
      </Animated.View>
          </Modal>
    );
  } 