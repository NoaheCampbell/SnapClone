// Temporarily disabled - removed react-native-color-matrix-image-filters
// import {
//   Grayscale,
//   ColorMatrix,
//   concatColorMatrices,
//   brightness,
//   saturate
// } from 'react-native-color-matrix-image-filters';

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
    id: 'dramatic', 
    name: 'Drama', 
    icon: 'zap',
    overlayStyle: {
      backgroundColor: '#8B0000',
      opacity: 0.4,
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

// Temporarily disabled - filter components not available
// export {
//   Grayscale,
//   ColorMatrix,
//   concatColorMatrices,
//   brightness,
//   saturate
// }; 