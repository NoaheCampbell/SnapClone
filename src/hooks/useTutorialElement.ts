import { useEffect, useRef, useCallback } from 'react';
import { View } from 'react-native';

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

  const measureElement = useCallback(() => {
    if (elementRef.current) {
      console.log(`[Tutorial Element] Measuring element for step: ${stepId}`);
      elementRef.current.measure((x, y, width, height, pageX, pageY) => {
        console.log(`[Tutorial Element] Measured ${stepId}:`, { pageX, pageY, width, height });
        onMeasure(stepId, {
          x: pageX,
          y: pageY,
          width,
          height,
        });
      });
    } else {
      console.log(`[Tutorial Element] No ref for step: ${stepId}`);
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