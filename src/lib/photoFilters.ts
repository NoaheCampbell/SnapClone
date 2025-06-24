import {
  Grayscale,
  Invert,
  Sepia,
  Contrast,
  Vintage,
  ColorMatrix,
  concatColorMatrices,
  brightness,
  saturate
} from 'react-native-color-matrix-image-filters';

export interface FilterConfig {
  id: string;
  name: string;
  icon: string;
  component?: any;
  overlayStyle?: any;
}

export const photoFilters: FilterConfig[] = [
  { 
    id: 'none', 
    name: 'None', 
    icon: 'circle'
  },
  { 
    id: 'bw', 
    name: 'B&W', 
    icon: 'square',
    component: Grayscale,
    // No overlayStyle - handled specially in camera component
  },
  { 
    id: 'invert', 
    name: 'Invert', 
    icon: 'rotate-ccw',
    component: Invert,
    overlayStyle: {
      // Preview overlay - cyan tint to simulate invert
      backgroundColor: '#00FFFF',
      opacity: 0.3,
      mixBlendMode: 'difference'
    }
  },
  { 
    id: 'sepia', 
    name: 'Sepia', 
    icon: 'sun',
    component: Sepia,
    overlayStyle: {
      backgroundColor: '#D2691E',
      opacity: 0.4,
    }
  },
  { 
    id: 'cool', 
    name: 'Cool', 
    icon: 'droplet',
    overlayStyle: {
      backgroundColor: '#4A90E2',
      opacity: 0.3,
    }
  },
  { 
    id: 'warm', 
    name: 'Warm', 
    icon: 'thermometer',
    overlayStyle: {
      backgroundColor: '#FF6B35',
      opacity: 0.3,
    }
  },
  { 
    id: 'vintage', 
    name: 'Vintage', 
    icon: 'camera',
    component: Vintage,
    overlayStyle: {
      backgroundColor: '#D4A574',
      opacity: 0.4,
    }
  },
  { 
    id: 'dramatic', 
    name: 'Drama', 
    icon: 'zap',
    overlayStyle: {
      backgroundColor: '#8B0000',
      opacity: 0.4,
    }
  },
  { 
    id: 'contrast', 
    name: 'Contrast', 
    icon: 'sun',
    component: Contrast,
    overlayStyle: {
      backgroundColor: '#FFFFFF',
      opacity: 0.2,
    }
  },
  { 
    id: 'noir', 
    name: 'Noir', 
    icon: 'moon',
    overlayStyle: {
      backgroundColor: '#000000',
      opacity: 0.5,
    }
  }
];

// Export filter components for easy use
export {
  Grayscale,
  Invert,
  Sepia,
  Contrast,
  Vintage,
  ColorMatrix,
  concatColorMatrices,
  brightness,
  saturate
}; 