import React, { useState, useRef } from 'react';
import { View, Text, Animated, PanResponder, Dimensions } from 'react-native';
import GifLoadingIndicator from './GifLoadingIndicator';

interface CustomPullToRefreshProps {
  onRefresh: () => void;
  refreshing: boolean;
  children: React.ReactNode;
  pullDistance?: number;
  refreshThreshold?: number;
}

const { height: screenHeight } = Dimensions.get('window');

export default function CustomPullToRefresh({
  onRefresh,
  refreshing,
  children,
  pullDistance = 120,
  refreshThreshold = 80
}: CustomPullToRefreshProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [canRefresh, setCanRefresh] = useState(false);
  const pullValue = useRef(new Animated.Value(0)).current;
  const rotateValue = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only respond to downward swipes when at the top of the list
        return gestureState.dy > 10 && gestureState.dy > Math.abs(gestureState.dx);
      },
      onPanResponderGrant: () => {
        setIsPulling(true);
        pullValue.setValue(0);
        rotateValue.setValue(0);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy < 0) return; // Don't allow upward movement
        
        const newValue = Math.min(gestureState.dy * 0.5, pullDistance);
        pullValue.setValue(newValue);
        
        // Rotate the GIF as we pull
        const rotateAmount = Math.min(gestureState.dy / pullDistance, 1);
        rotateValue.setValue(rotateAmount);
        
        // Check if we've pulled far enough to trigger refresh
        setCanRefresh(gestureState.dy > refreshThreshold);
      },
      onPanResponderRelease: (evt, gestureState) => {
        setIsPulling(false);
        
        if (gestureState.dy > refreshThreshold && !refreshing) {
          // Trigger refresh
          onRefresh();
          // Keep the pull indicator visible while refreshing
          Animated.spring(pullValue, {
            toValue: refreshThreshold,
            useNativeDriver: false,
            tension: 50,
            friction: 8,
          }).start();
        } else {
          // Snap back to original position
          Animated.spring(pullValue, {
            toValue: 0,
            useNativeDriver: false,
            tension: 50,
            friction: 8,
          }).start();
        }
        
        setCanRefresh(false);
      },
    })
  ).current;

  // Hide the pull indicator when refreshing is complete
  React.useEffect(() => {
    if (!refreshing && !isPulling) {
      Animated.spring(pullValue, {
        toValue: 0,
        useNativeDriver: false,
        tension: 50,
        friction: 8,
      }).start();
    }
  }, [refreshing, isPulling]);

  const pullOpacity = pullValue.interpolate({
    inputRange: [0, refreshThreshold],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const pullScale = pullValue.interpolate({
    inputRange: [0, refreshThreshold],
    outputRange: [0.5, 1],
    extrapolate: 'clamp',
  });

  const rotateInterpolation = rotateValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={{ flex: 1 }}>
      {/* Pull to refresh indicator */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: pullValue,
          zIndex: 1000,
          backgroundColor: 'transparent',
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: 10,
        }}
      >
        <Animated.View
          style={{
            opacity: pullOpacity,
            transform: [
              { scale: pullScale },
              { rotate: refreshing ? '0deg' : rotateInterpolation }
            ],
          }}
        >
          <GifLoadingIndicator size="large" />
        </Animated.View>
        
        <Animated.View style={{ opacity: pullOpacity, marginTop: 8 }}>
          <Text
            style={{
              color: '#9CA3AF',
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            {refreshing 
              ? 'Refreshing...' 
              : canRefresh 
                ? 'Release to refresh' 
                : 'Pull to refresh'
            }
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Content with gesture handling */}
      <Animated.View
        style={{
          flex: 1,
          transform: [{ translateY: pullValue }],
        }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
} 