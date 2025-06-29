import React, { useRef, useEffect, useState } from 'react';
import { View, Dimensions, TouchableOpacity, Text } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configuration - set to false to disable video splash screen
const ENABLE_VIDEO_SPLASH = true;

// Video display configuration
const VIDEO_CONFIG = {
  // Resize mode options: 'cover', 'contain', 'stretch'
  resizeMode: ResizeMode.COVER, // Fills entire screen
  
  // Size options - set to 'fullscreen' or 'fitted'
  sizeMode: 'fullscreen' as 'fullscreen' | 'fitted',
  
  // Orientation - set to 'portrait', 'landscape', or 'auto'
  orientation: 'auto' as 'portrait' | 'landscape' | 'auto',
  
  // For fitted mode - percentage of screen to use
  widthPercentage: 90, // 90% of screen width
  heightPercentage: 60, // 60% of screen height
};

interface VideoSplashScreenProps {
  onComplete: () => void;
}

const { width, height } = Dimensions.get('window');

export default function VideoSplashScreen({ onComplete }: VideoSplashScreenProps) {
  const video = useRef<Video>(null);
  const [shouldPlay, setShouldPlay] = useState(false);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [videoSource, setVideoSource] = useState<any>(null);

  useEffect(() => {
    // If video splash is disabled, immediately complete
    if (!ENABLE_VIDEO_SPLASH) {
      markFirstLaunchComplete();
      onComplete();
      return;
    }

    // Try to load the video source
    const loadVideoSource = () => {
      try {
        const source = require('../../assets/videos/intro.mp4');
        setVideoSource(source);
      } catch (error) {
        setHasError(true);
        setShowSkipButton(true);
        return;
      }
    };

    loadVideoSource();

    // Handle orientation (simplified to avoid issues)
    const setupOrientation = async () => {
      try {
        if (VIDEO_CONFIG.orientation === 'landscape') {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else if (VIDEO_CONFIG.orientation === 'portrait') {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
        }
        // 'auto' keeps current orientation
      } catch (error) {
        // Don't fail the whole component if orientation fails
      }
    };

    setupOrientation();

    // Show skip button after 3 seconds
    const timer = setTimeout(() => {
      setShowSkipButton(true);
    }, 3000);

    // Cleanup function
    return () => {
      clearTimeout(timer);
      // Reset orientation when leaving
      if (VIDEO_CONFIG.orientation !== 'auto') {
        ScreenOrientation.unlockAsync().catch(() => {});
      }
    };
  }, []);

  // Start playing once we have a video source
  useEffect(() => {
    if (videoSource && !hasError) {
      setShouldPlay(true);
    }
  }, [videoSource, hasError]);

  const handlePlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      if (status.didJustFinish) {
        markFirstLaunchComplete();
        onComplete();
      }
    } else if (status.error) {
      setHasError(true);
      setShowSkipButton(true);
    }
  };

  const markFirstLaunchComplete = async () => {
    try {
      await AsyncStorage.setItem('hasSeenIntroVideo', 'true');
    } catch (error) {
      // Silently handle error
    }
  };

  const handleVideoLoad = () => {
    // Video loaded successfully
  };

  const handleVideoError = (error: any) => {
    setHasError(true);
    setShowSkipButton(true);
  };

  const handleSkip = () => {
    markFirstLaunchComplete();
    onComplete();
  };

  const handleTapToSkip = () => {
    if (showSkipButton) {
      handleSkip();
    }
  };

  // Calculate video dimensions based on config
  const getVideoDimensions = () => {
    if (VIDEO_CONFIG.sizeMode === 'fullscreen') {
      return {
        width: width,
        height: height,
      };
    } else {
      // Fitted mode
      return {
        width: width * (VIDEO_CONFIG.widthPercentage / 100),
        height: height * (VIDEO_CONFIG.heightPercentage / 100),
      };
    }
  };

  const videoDimensions = getVideoDimensions();

  // If disabled, don't render anything (onComplete will be called in useEffect)
  if (!ENABLE_VIDEO_SPLASH) {
    return null;
  }

  return (
    <TouchableOpacity 
      style={{ flex: 1 }} 
      onPress={handleTapToSkip}
      activeOpacity={1}
    >
      <View style={{ 
        flex: 1, 
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        {!hasError && videoSource ? (
          <Video
            ref={video}
            source={videoSource}
            style={{
              width: videoDimensions.width,
              height: videoDimensions.height,
              borderRadius: VIDEO_CONFIG.sizeMode === 'fitted' ? 12 : 0,
            }}
            shouldPlay={shouldPlay}
            isLooping={false}
            resizeMode={VIDEO_CONFIG.resizeMode}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            onLoad={handleVideoLoad}
            onError={handleVideoError}
            useNativeControls={false}
          />
        ) : (
          // Fallback view if video fails to load or no video source
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
            <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
              SprintLoop
            </Text>
            <Text style={{ color: '#666', fontSize: 16, textAlign: 'center', marginBottom: 20 }}>
              Welcome to your study companion
            </Text>
            {hasError && (
              <Text style={{ color: '#888', fontSize: 11, textAlign: 'center' }}>
                Video file not found. Add intro.mp4 to assets/videos/
              </Text>
            )}
          </View>
        )}
        
        {/* Skip button */}
        {showSkipButton && (
          <View style={{
            position: 'absolute',
            top: 60,
            right: 20,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
          }}>
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '500' }}>
              Tap to skip
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// Utility function for testing - call this to reset the intro video state
export const resetIntroVideoState = async () => {
  try {
    await AsyncStorage.removeItem('hasSeenIntroVideo');
  } catch (error) {
    // Silently handle error
  }
}; 