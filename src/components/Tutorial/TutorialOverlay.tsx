import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetElement?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: () => void; // Optional action to perform when this step is shown
  highlightColor?: string;
  requiresInteraction?: boolean; // If true, user must click the highlighted area
  onTargetPress?: () => void; // Called when user clicks the highlighted area
}

interface TutorialOverlayProps {
  visible: boolean;
  steps: TutorialStep[];
  currentStep: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

export default function TutorialOverlay({
  visible,
  steps,
  currentStep,
  onNext,
  onPrevious,
  onSkip,
  onComplete,
}: TutorialOverlayProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const pulseScaleAnim = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();
  
  const [tooltipLayout, setTooltipLayout] = useState<{ width: number; height: number } | null>(null);

  const currentTutorialStep = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  useEffect(() => {
    if (visible) {
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

      // Execute step action if provided
      if (currentTutorialStep?.action) {
        setTimeout(() => {
          currentTutorialStep.action!();
        }, 100);
      }
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
      pulseAnim.setValue(0.3);
      pulseScaleAnim.setValue(1);
    }
  }, [visible, currentStep]);

  if (!visible || !currentTutorialStep) return null;

  const getTooltipPosition = () => {
    const tooltipMaxWidth = 280; // Maximum width for tooltip
    const tooltipPadding = 16; // Padding from screen edges
    const arrowSize = 12; // Space for arrow
    
    if (!currentTutorialStep.targetElement) {
      return {
        top: screenHeight / 2 - 100,
        left: 20,
        right: 20,
      };
    }

    const { x, y, width, height } = currentTutorialStep.targetElement;
    const tooltipPosition = currentTutorialStep.tooltipPosition || 'bottom';
    
    // Use raw coordinates since useTutorialElement now provides absolute screen positions
    const adjustedY = y;

    // Calculate center points of target element
    const targetCenterX = x + width / 2;
    const targetCenterY = adjustedY + height / 2;

    switch (tooltipPosition) {
      case 'top':
        // Position above the element
        return {
          bottom: screenHeight - adjustedY + arrowSize,
          left: Math.max(
            tooltipPadding, 
            Math.min(
              targetCenterX - tooltipMaxWidth / 2,
              screenWidth - tooltipMaxWidth - tooltipPadding
            )
          ),
          maxWidth: tooltipMaxWidth,
        };
      case 'bottom':
        // Position below the element
        return {
          top: adjustedY + height + arrowSize,
          left: Math.max(
            tooltipPadding,
            Math.min(
              targetCenterX - tooltipMaxWidth / 2,
              screenWidth - tooltipMaxWidth - tooltipPadding
            )
          ),
          maxWidth: tooltipMaxWidth,
        };
      case 'left':
        // Position to the left of element
        return {
          top: Math.max(tooltipPadding, targetCenterY - 50),
          right: screenWidth - x + arrowSize,
          maxWidth: Math.min(tooltipMaxWidth, x - arrowSize - tooltipPadding * 2),
        };
      case 'right':
        // Position to the right of element
        return {
          top: Math.max(tooltipPadding, targetCenterY - 50),
          left: x + width + arrowSize,
          maxWidth: Math.min(tooltipMaxWidth, screenWidth - x - width - arrowSize - tooltipPadding * 2),
        };
      case 'center':
      default:
        return {
          top: screenHeight / 2 - 100,
          left: 20,
          right: 20,
        };
    }
  };

  const getArrowPosition = () => {
    if (!currentTutorialStep.targetElement || !tooltipLayout || currentTutorialStep.tooltipPosition === 'center') {
      return null;
    }

    const { x, y, width, height } = currentTutorialStep.targetElement;
    const tooltipPosition = currentTutorialStep.tooltipPosition || 'bottom';
    const tooltipPos = getTooltipPosition();
    
    // Use raw coordinates since useTutorialElement now provides absolute screen positions
    const adjustedY = y;
    
    // Calculate center of target element
    const targetCenterX = x + width / 2;
    const targetCenterY = adjustedY + height / 2;
    
    // Calculate tooltip position
    let tooltipLeft = 0;
    let tooltipTop = 0;
    
    if ('left' in tooltipPos) {
      tooltipLeft = tooltipPos.left as number;
    } else if ('right' in tooltipPos) {
      tooltipLeft = screenWidth - (tooltipPos.right as number) - tooltipLayout.width;
    }
    
    if ('top' in tooltipPos) {
      tooltipTop = tooltipPos.top as number;
    } else if ('bottom' in tooltipPos) {
      tooltipTop = screenHeight - (tooltipPos.bottom as number) - tooltipLayout.height;
    }

    switch (tooltipPosition) {
      case 'bottom':
        return {
          top: -10,
          left: Math.max(10, Math.min(targetCenterX - tooltipLeft - 10, tooltipLayout.width - 20)),
          borderLeftWidth: 10,
          borderRightWidth: 10,
          borderBottomWidth: 10,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: 'white',
        };
      case 'top':
        return {
          bottom: -10,
          left: Math.max(10, Math.min(targetCenterX - tooltipLeft - 10, tooltipLayout.width - 20)),
          borderLeftWidth: 10,
          borderRightWidth: 10,
          borderTopWidth: 10,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: 'white',
        };
      case 'right':
        return {
          left: -10,
          top: Math.max(10, Math.min(targetCenterY - tooltipTop - 10, tooltipLayout.height - 20)),
          borderTopWidth: 10,
          borderBottomWidth: 10,
          borderRightWidth: 10,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderRightColor: 'white',
        };
      case 'left':
        return {
          right: -10,
          top: Math.max(10, Math.min(targetCenterY - tooltipTop - 10, tooltipLayout.height - 20)),
          borderTopWidth: 10,
          borderBottomWidth: 10,
          borderLeftWidth: 10,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: 'white',
        };
      default:
        return null;
    }
  };

  const renderHighlight = () => {
    if (!currentTutorialStep.targetElement) return null;

    const { x, y, width, height } = currentTutorialStep.targetElement;
    const highlightColor = currentTutorialStep.highlightColor || '#3B82F6';
    
    // Use raw coordinates since useTutorialElement now provides absolute screen positions
    const adjustedY = y;

    return (
      <>
        {/* Outer glow effect */}
        <Animated.View
          style={{
            position: 'absolute',
            left: x - 12,
            top: adjustedY - 12,
            width: width + 24,
            height: height + 24,
            borderRadius: 16,
            backgroundColor: highlightColor,
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
            left: x - 8,
            top: adjustedY - 8,
            width: width + 16,
            height: height + 16,
            borderRadius: 12,
            backgroundColor: highlightColor,
            opacity: 0.3,
          }}
        />
        
        {/* Inner border */}
        <View
          style={{
            position: 'absolute',
            left: x - 4,
            top: adjustedY - 4,
            width: width + 8,
            height: height + 8,
            borderRadius: 8,
            borderWidth: 3,
            borderColor: highlightColor,
            backgroundColor: 'transparent',
          }}
        />
        
        {/* Pulsing border overlay */}
        <Animated.View
          style={{
            position: 'absolute',
            left: x - 4,
            top: adjustedY - 4,
            width: width + 8,
            height: height + 8,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: highlightColor,
            backgroundColor: 'transparent',
            opacity: pulseAnim,
          }}
        />
      </>
    );
  };

  const renderOverlay = () => {
    if (!currentTutorialStep.targetElement) {
      return (
        <TouchableWithoutFeedback onPress={() => {}}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)' }} />
        </TouchableWithoutFeedback>
      );
    }

    const { x, y, width, height } = currentTutorialStep.targetElement;
    // Use raw coordinates since useTutorialElement now provides absolute screen positions
    const adjustedY = y;

    return (
      <>
        {/* Blocking overlay sections */}
        <TouchableWithoutFeedback onPress={() => {}}>
          <View>
            {/* Top overlay */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: adjustedY,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
              }}
            />
            {/* Left overlay */}
            <View
              style={{
                position: 'absolute',
                top: adjustedY,
                left: 0,
                width: x,
                height: height,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
              }}
            />
            {/* Right overlay */}
            <View
              style={{
                position: 'absolute',
                top: adjustedY,
                left: x + width,
                right: 0,
                height: height,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
              }}
            />
            {/* Bottom overlay */}
            <View
              style={{
                position: 'absolute',
                top: adjustedY + height,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
              }}
            />
          </View>
        </TouchableWithoutFeedback>
        
        {/* Clickable target area */}
        {currentTutorialStep.requiresInteraction && (
          <TouchableOpacity
            style={{
              position: 'absolute',
              left: x,
              top: adjustedY,
              width: width,
              height: height,
              backgroundColor: 'transparent', // Make it transparent
              zIndex: 9999,
            }}
            onPress={() => {
              if (currentTutorialStep.onTargetPress) {
                currentTutorialStep.onTargetPress();
              }
            }}
            activeOpacity={0.7}
          />
        )}
      </>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none">
      <StatusBar backgroundColor="rgba(0, 0, 0, 0.7)" barStyle="light-content" />
      <View style={{ flex: 1 }}>
        {renderOverlay()}
        {renderHighlight()}
        
        <Animated.View
          style={[
            {
              position: 'absolute',
              ...getTooltipPosition(),
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setTooltipLayout({ width, height });
            }}
          >
            {/* Arrow pointing to target element */}
            {(() => {
              const arrowStyle = getArrowPosition();
              return arrowStyle && (
                <View
                  style={{
                    position: 'absolute',
                    width: 0,
                    height: 0,
                    borderStyle: 'solid',
                    ...arrowStyle,
                  }}
                />
              );
            })()}
            <View className="bg-white rounded-2xl p-4 shadow-lg" style={{ elevation: 5 }}>
              {/* Progress indicator */}
              <View className="flex-row justify-between items-center mb-2">
                <View className="flex-row">
                  {steps.map((_, index) => (
                    <View
                      key={index}
                      className={`w-1.5 h-1.5 rounded-full mr-1 ${
                        index === currentStep ? 'bg-blue-500' : 'bg-gray-300'
                      }`}
                    />
                  ))}
                </View>
                <TouchableOpacity onPress={onSkip} className="p-1 -mr-1">
                  <Text className="text-gray-500 text-xs">Skip</Text>
                </TouchableOpacity>
              </View>

              {/* Content */}
              <View className="mb-3">
                <Text className="text-base font-bold text-gray-900 mb-1">
                  {currentTutorialStep.title}
                </Text>
                <Text className="text-sm text-gray-700 leading-5">
                  {currentTutorialStep.description}
                </Text>
              </View>

              {/* Navigation buttons */}
              <View className="flex-row justify-between items-center">
                <TouchableOpacity
                  onPress={onPrevious}
                  disabled={isFirstStep}
                  className={`px-3 py-1.5 rounded-lg ${
                    isFirstStep ? 'opacity-30' : ''
                  }`}
                >
                  <Text className="text-blue-500 text-sm font-medium">Previous</Text>
                </TouchableOpacity>

                <Text className="text-gray-500 text-xs">
                  {currentStep + 1} of {steps.length}
                </Text>

                {!currentTutorialStep.requiresInteraction ? (
                  <TouchableOpacity
                    onPress={isLastStep ? onComplete : onNext}
                    className="bg-blue-500 px-4 py-1.5 rounded-lg"
                  >
                    <Text className="text-white text-sm font-medium">
                      {isLastStep ? 'Done' : 'Next'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View className="bg-gray-300 px-4 py-1.5 rounded-lg opacity-50">
                    <Text className="text-gray-600 text-sm font-medium">
                      Tap highlighted area
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}