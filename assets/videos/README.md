# Video Splash Screen Setup

## Adding Your Intro Video

To use the video splash screen feature, place your MP4 video file in this directory and name it `intro.mp4`.

### Requirements:
- **Format**: MP4
- **Name**: Must be exactly `intro.mp4`
- **Recommended specs**:
  - Duration: 2-5 seconds (keep it short for better UX)
  - Resolution: 1080p or higher
  - Aspect ratio: 16:9 or match your app's typical aspect ratio
  - File size: Under 5MB for better performance

### Usage:
1. Place your `intro.mp4` file in this directory (`assets/videos/`)
2. The video will automatically play when appropriate (see "When Video Plays" below)
3. Users can tap anywhere to skip after 3 seconds
4. If the video file is missing or fails to load, a fallback screen will show

### When Video Plays:
- ✅ **Every app launch** (current default setting)
- ✅ **First app installation** (one time only - if configured)
- ✅ **App reopened after force close** (when killed from memory - if configured)
- ✅ **App backgrounded for specified time** (when phone optimizes memory - if configured)

### Features:
- ✅ Smart launch detection (configurable)
- ✅ Tap to skip functionality
- ✅ Automatic fallback if video fails
- ✅ Full screen coverage
- ✅ Smooth transition to main app
- ✅ Easy enable/disable configuration
- ✅ Flexible video sizing and orientation
- ✅ Background time tracking

### Configuration:

#### App Launch Behavior:
Edit the `VIDEO_SPLASH_CONFIG` object in `src/app/index.tsx`:

```typescript
const VIDEO_SPLASH_CONFIG = {
  // Show video on first launch
  showOnFirstLaunch: true,
  
  // Show video when app becomes active after being backgrounded for this long (in minutes)
  backgroundThresholdMinutes: 0.1,
  
  // Show video when app is force closed and reopened
  showOnAppReactivation: true,
  
  // Show video on every app start (ignores other conditions)
  showOnEveryStart: true,
}
```

#### Video Display Settings:
Edit the `VIDEO_CONFIG` object in `src/components/VideoSplashScreen.tsx`:

```typescript
const VIDEO_CONFIG = {
  // Resize mode options: 'cover', 'contain', 'stretch'
  resizeMode: ResizeMode.CONTAIN, // How video fits in container
  
  // Size options: 'fullscreen' or 'fitted'
  sizeMode: 'fitted', // Use 'fitted' for smaller video with padding
  
  // Orientation: 'portrait', 'landscape', or 'auto'  
  orientation: 'auto', // Force specific orientation or keep current
  
  // For fitted mode - percentage of screen to use
  widthPercentage: 90, // 90% of screen width
  heightPercentage: 60, // 60% of screen height
};
```

#### Common App Launch Configurations:

**Every App Launch (Current Default):**
```typescript
const VIDEO_SPLASH_CONFIG = {
  showOnEveryStart: true,           // Shows every time
  // Other settings are ignored when this is true
}
```

**Smart Detection (Recommended for Production):**
```typescript
const VIDEO_SPLASH_CONFIG = {
  showOnFirstLaunch: true,
  backgroundThresholdMinutes: 5,    // Show after 5+ min background
  showOnAppReactivation: true,
  showOnEveryStart: false,          // Use smart detection
}
```

**Only First Launch:**
```typescript
const VIDEO_SPLASH_CONFIG = {
  showOnFirstLaunch: true,
  backgroundThresholdMinutes: 999,  // Effectively disable background trigger
  showOnAppReactivation: false,
  showOnEveryStart: false,
}
```

**Disable Completely:**
```typescript
// In VideoSplashScreen.tsx
const ENABLE_VIDEO_SPLASH = false;
```

#### Common Video Display Configurations:

**For videos that are too wide:**
```typescript
const VIDEO_CONFIG = {
  resizeMode: ResizeMode.CONTAIN, // Fits entire video without cropping
  sizeMode: 'fitted',
  widthPercentage: 80, // Make it smaller
  heightPercentage: 50,
  orientation: 'auto',
};
```

**For landscape videos:**
```typescript
const VIDEO_CONFIG = {
  resizeMode: ResizeMode.COVER,
  sizeMode: 'fullscreen',
  orientation: 'landscape', // Force landscape mode
};
```

**For portrait videos:**
```typescript
const VIDEO_CONFIG = {
  resizeMode: ResizeMode.CONTAIN,
  sizeMode: 'fitted',
  widthPercentage: 90,
  heightPercentage: 60,
  orientation: 'portrait',
};
```

#### Resize Mode Options:
- **`CONTAIN`**: Fits the entire video within the bounds (may show black bars)
- **`COVER`**: Fills the entire container (may crop parts of the video)
- **`STRETCH`**: Stretches video to fill container (may distort aspect ratio)

#### Size Mode Options:
- **`fullscreen`**: Video takes up entire screen
- **`fitted`**: Video is centered with padding around it (uses percentage settings)

#### Orientation Options:
- **`auto`**: Keeps current device orientation
- **`portrait`**: Forces portrait orientation during video
- **`landscape`**: Forces landscape orientation during video

### Testing:
To test the video splash behavior:

1. **Force close and reopen** - Should show video (if configured)
2. **Background test** - Background the app for the specified time, then reopen
3. **Fresh install** - Uninstall and reinstall the app

### Example video placement:
```
assets/
└── videos/
    └── intro.mp4  ← Your video file goes here
```

### Troubleshooting:
- **Video too wide?** Use `ResizeMode.CONTAIN` and `sizeMode: 'fitted'`
- **Video too small?** Use `sizeMode: 'fullscreen'` or increase percentage values
- **Wrong orientation?** Set `orientation: 'landscape'` or `'portrait'` 
- **Video distorted?** Avoid `ResizeMode.STRETCH`, use `CONTAIN` or `COVER`
- **Video doesn't play?** Check that the file is exactly named `intro.mp4`
- **Performance issues?** Reduce video file size or resolution
- **Video plays too often?** Set `showOnEveryStart: false` and configure thresholds
- **Video never plays?** Ensure file exists and check configuration settings