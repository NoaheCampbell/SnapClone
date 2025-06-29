import React from 'react';
import { View, Image, ViewStyle } from 'react-native';

interface GifLoadingIndicatorProps {
  size?: 'small' | 'large';
  color?: string; // For backwards compatibility, though GIFs have their own colors
  style?: ViewStyle;
}

// Pre-require the GIF to avoid loading delays
const LOADING_GIF = require('../../assets/images/loading.gif');

const GifLoadingIndicator = React.memo(({ 
  size = 'large', 
  color, // Kept for compatibility but won't affect GIF
  style 
}: GifLoadingIndicatorProps) => {
  // Size mapping - smaller for better performance
  const sizeValue = size === 'small' ? 24 : 40;
  
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      <Image
        source={LOADING_GIF}
        style={{
          width: sizeValue,
          height: sizeValue,
        }}
        resizeMode="contain"
        // Performance optimizations
        fadeDuration={0}
        loadingIndicatorSource={undefined}
      />
    </View>
  );
});

GifLoadingIndicator.displayName = 'GifLoadingIndicator';

export default GifLoadingIndicator;

// Backwards compatibility - also export as ActivityIndicator replacement
export { GifLoadingIndicator as ActivityIndicator }; 