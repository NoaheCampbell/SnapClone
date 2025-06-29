import { useEffect, useRef, useCallback } from 'react';
import { View, StatusBar, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ElementPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useTutorialElement(
  stepId: string,
  onMeasure: (stepId: string, position: ElementPosition) => void,
  dependencies: any[] = []
) {
  const elementRef = useRef<View>(null);
  const insets = useSafeAreaInsets();

  const measureElement = useCallback(() => {
    if (elementRef.current) {
      elementRef.current.measure((x, y, width, height, pageX, pageY) => {
        // Only log if the position is meaningful (not zero)
        if (width > 0 && height > 0) {
          // Get status bar height
          const statusBarHeight = Platform.OS === 'ios' ? 0 : StatusBar.currentHeight || 0;
          
          // Adjust Y position to account for safe area and status bar
          const adjustedY = pageY - insets.top - statusBarHeight;
          

          
          onMeasure(stepId, {
            x: pageX,
            y: adjustedY,
            width,
            height,
          });
        }
      });
    }
  }, [stepId, onMeasure, insets.top]);

  useEffect(() => {
    // Delay measurement to ensure layout is complete
    const timer = setTimeout(() => {
      measureElement();
    }, 100);

    return () => clearTimeout(timer);
  }, [...dependencies, measureElement]);

  return {
    ref: elementRef,
    measure: measureElement,
  };
} 