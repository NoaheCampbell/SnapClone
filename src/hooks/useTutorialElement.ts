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
  const lastMeasurementRef = useRef<ElementPosition | null>(null);

  const measureElement = useCallback(() => {
    if (elementRef.current) {
      // Use measureInWindow for more stable measurements
      elementRef.current.measureInWindow((x, y, width, height) => {
        // Only process if the position is meaningful (not zero)
        if (width > 0 && height > 0) {
          const newPosition = { x, y, width, height };
          
          // Check if this measurement is significantly different from the last one
          const lastPos = lastMeasurementRef.current;
          if (lastPos) {
            const yDiff = Math.abs(newPosition.y - lastPos.y);
            // If the Y position changed by more than 100 pixels, it's likely a layout shift
            // In this case, wait a bit and measure again
            if (yDiff > 100) {
              setTimeout(() => {
                if (elementRef.current) {
                  elementRef.current.measureInWindow((x2, y2, width2, height2) => {
                    if (width2 > 0 && height2 > 0) {
                      lastMeasurementRef.current = { x: x2, y: y2, width: width2, height: height2 };
                      onMeasure(stepId, { x: x2, y: y2, width: width2, height: height2 });
                    }
                  });
                }
              }, 300);
              return;
            }
          }
          
          lastMeasurementRef.current = newPosition;
          onMeasure(stepId, newPosition);
        }
      });
    }
  }, [stepId, onMeasure]);

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