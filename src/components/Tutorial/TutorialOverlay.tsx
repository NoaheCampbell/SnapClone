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
  requiresInteraction?: boolean;
  action?: () => void;
}

interface TutorialOverlayProps {
  steps: TutorialStep[];
  onComplete: () => void;
  isVisible: boolean;
}

export default function TutorialOverlay({ steps, onComplete, isVisible }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetMeasurements, setTargetMeasurements] = useState<any>(null);
  const [measurementsReady, setMeasurementsReady] = useState(false);
  const [tutorialStarted, setTutorialStarted] = useState(false);
  const [measurementsCache, setMeasurementsCache] = useState<{[key: string]: any}>({});
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const pulseScaleAnim = useRef(new Animated.Value(1)).current;
  const highlightOpacity = useRef(new Animated.Value(0)).current;

  // Check if tutorial was already completed
  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_KEY).then((value) => {
      if (value === 'true' && isVisible) {
        onComplete();
      }
    });
  }, []);

  // Pre-measure all available targets
  const preMeasureTargets = useCallback(() => {
    const cache: {[key: string]: any} = {};
    let measuredCount = 0;
    let totalToMeasure = 0;

    steps.forEach((step) => {
      if (step.targetRef?.current && !step.customHighlight) {
        totalToMeasure++;
      } else if (step.targetPosition) {
        cache[step.id] = step.targetPosition;
      }
    });

    const checkComplete = () => {
      measuredCount++;
      if (measuredCount >= totalToMeasure) {
        setMeasurementsCache(cache);
        console.log('Pre-measurement complete:', cache);
      }
    };

    steps.forEach((step) => {
      if (step.targetRef?.current && !step.customHighlight) {
        try {
          if (typeof step.targetRef.current.measureInWindow === 'function') {
            step.targetRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
              if (width > 0 && height > 0) {
                cache[step.id] = { x, y, width, height };
                console.log('Pre-measured:', step.id, { x, y, width, height });
              }
              checkComplete();
            });
          } else {
            checkComplete();
          }
        } catch (error) {
          console.error('Error pre-measuring:', step.id, error);
          checkComplete();
        }
      }
    });

    // If no measurements needed, set cache immediately
    if (totalToMeasure === 0) {
      setMeasurementsCache(cache);
    }
  }, [steps]);

  // Animate in when visible and pre-measure targets
  useEffect(() => {
    if (isVisible) {
      setTutorialStarted(true);
      
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

      // Pre-measure all targets
      setTimeout(() => {
        preMeasureTargets();
      }, 100);

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
      setTutorialStarted(false);
      setMeasurementsCache({});
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
      pulseAnim.setValue(0.3);
      pulseScaleAnim.setValue(1);
      highlightOpacity.setValue(0);
    }
  }, [isVisible, preMeasureTargets]);

  // Update measurements when step changes using cached values
  useEffect(() => {
    const step = steps[currentStep];
    
    console.log('Step changed to:', step.id, 'Cache:', measurementsCache);
    
    // Check if we have cached measurements for this step
    const cachedMeasurement = measurementsCache[step.id];
    
    if (cachedMeasurement) {
      // Use cached measurements - instant transition
      console.log('Using cached measurement for:', step.id, cachedMeasurement);
      setTargetMeasurements(cachedMeasurement);
      setMeasurementsReady(true);
      
      // Smooth transition to new position
      Animated.timing(highlightOpacity, {
        toValue: 1,
        duration: currentStep === 0 ? 300 : 200,
        useNativeDriver: true,
      }).start();
    } else if (step?.customHighlight) {
      // No measurements needed for custom highlight steps
      setTargetMeasurements(null);
      setMeasurementsReady(true);
      
      // Hide highlight for custom steps
      Animated.timing(highlightOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else {
      // Fallback: try to measure dynamically (for steps not in cache)
      console.log('No cached measurement, measuring dynamically:', step.id);
      
      // Fade out highlight while measuring
      Animated.timing(highlightOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
      
      setTargetMeasurements(null);
      setMeasurementsReady(false);
      
      const measureElement = () => {
        if (step?.targetRef?.current && !step.customHighlight) {
          try {
            if (typeof step.targetRef.current.measureInWindow === 'function') {
              step.targetRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
                if (width > 0 && height > 0) {
                  console.log('Dynamically measured element:', step.id, { x, y, width, height });
                  setTargetMeasurements({ x, y, width, height });
                  setMeasurementsReady(true);
                  // Fade in highlight with new position
                  Animated.timing(highlightOpacity, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                  }).start();
                } else {
                  console.warn('Invalid measurements for step:', step.id, { x, y, width, height });
                  setTimeout(measureElement, 10);
                }
              });
            } else {
              console.warn('measureInWindow not available for step:', step.id);
              setTargetMeasurements(null);
              setMeasurementsReady(true);
            }
          } catch (error) {
            console.error('Error measuring element for step:', step.id, error);
            setTargetMeasurements(null);
            setMeasurementsReady(true);
          }
        }
      };
      
      setTimeout(measureElement, 50);
    }
  }, [currentStep, steps, measurementsCache]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTutorial();
    }
  };

  const handleInteraction = () => {
    // Handle interaction with highlighted element
    if (steps[currentStep]?.requiresInteraction) {
      const currentStepData = steps[currentStep];
      
      // Execute the action if it exists
      if (currentStepData.action) {
        currentStepData.action();
      }
      
      // If this is the last step with an action, complete the tutorial
      if (currentStep === steps.length - 1) {
        completeTutorial();
      } else {
        // Otherwise advance to next step
        handleNext();
      }
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
        {/* Basic dark overlay - always present */}
        <View className="absolute inset-0 bg-black/60" />
        
        {/* Highlight overlay - animated */}
        <Animated.View style={{ opacity: highlightOpacity, flex: 1 }}>
          {targetMeasurements && !step.customHighlight && (
            <>
              {/* Dark overlay sections with cutout */}
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
                  backgroundColor: NEON_GREEN,
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
                  backgroundColor: NEON_GREEN,
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
                  borderColor: NEON_GREEN,
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
                  borderColor: NEON_GREEN,
                  backgroundColor: 'transparent',
                  opacity: pulseAnim,
                }}
              />
              
              {/* Interactive touchable area - rendered on top of all highlight effects */}
              {step.requiresInteraction && (
                <TouchableOpacity
                  style={{
                    position: 'absolute',
                    left: targetMeasurements.x - (step.highlightPadding || 12),
                    top: targetMeasurements.y - (step.highlightPadding || 12),
                    width: targetMeasurements.width + (step.highlightPadding || 12) * 2,
                    height: targetMeasurements.height + (step.highlightPadding || 12) * 2,
                    zIndex: 1000,
                  }}
                  onPress={handleInteraction}
                  activeOpacity={0.8}
                />
              )}
            </>
          )}
        </Animated.View>
        
        {/* Tutorial card - always show once tutorial starts */}
        {tutorialStarted && (
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
                
                {/* Next/Action button - hidden for interactive steps */}
                {!step.requiresInteraction ? (
                  <TouchableOpacity
                    onPress={handleNext}
                    className="px-6 py-2.5 bg-blue-500 rounded-full"
                  >
                    <Text className="text-white text-base font-medium">
                      {isLastStep ? 'Get Started' : 'Continue'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View className="px-6 py-2.5">
                    <Text className="text-blue-500 text-base font-medium">
                      👆 Tap highlighted area
                    </Text>
                  </View>
                )}
                
                {/* Placeholder for right side */}
                <View className={`px-4 py-2 ${currentStep === 0 ? '' : 'opacity-0'}`}>
                  <Text className="text-blue-500 text-base">Previous</Text>
                </View>
              </View>
              
              {/* Tap highlighted area text - only show when there's a highlight */}
              {measurementsReady && targetMeasurements && !step.customHighlight && (
                <Text className="text-gray-400 text-sm text-center mt-3">
                  {step.requiresInteraction ? 'Tap the highlighted area to continue' : 'Tap highlighted area'}
                </Text>
              )}
            </View>
          </View>
        </View>
        )}
      </Animated.View>
          </Modal>
    );
  } 