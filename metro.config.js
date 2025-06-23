// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
// const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Temporarily disable NativeWind for debugging
module.exports = config;
// module.exports = withNativeWind(config, { input: './global.css' }); 