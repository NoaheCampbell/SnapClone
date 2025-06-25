# SnapClone 📸

A modern, feature-rich social media app built with React Native and Expo, inspired by Snapchat. SnapClone allows users to capture photos, apply filters, add text overlays, share stories, and connect with friends.

## ✨ Features

### 📷 Camera & Media
- **Real-time Camera**: Live camera preview with front/back camera switching
- **Photo Filters**: Multiple built-in filters including B&W, vintage, and color effects
- **Text Overlays**: Add, edit, and drag text with customizable colors, sizes, and fonts
- **Flash Control**: Toggle flash on/off for better photos
- **Photo Capture**: High-quality photo capture with filter and overlay application

### 👥 Social Features
- **Stories**: Share photos as stories that are visible to friends
- **Friends System**: Add friends, send/receive friend requests
- **Privacy Controls**: Private accounts, friend request settings, story visibility
- **Direct Messaging**: Send photos directly to friends
- **User Profiles**: Customizable profiles with avatars and display names

### 🔐 Authentication & Security
- **Secure Authentication**: Email/password authentication via Supabase
- **Profile Creation**: Custom usernames and display names
- **Privacy Settings**: Control who can see your content and send friend requests
- **Secure Storage**: API keys and sensitive data stored securely

### 🎨 Modern UI/UX
- **Dark Theme**: Beautiful dark theme with modern design
- **Gesture Controls**: Intuitive tap-to-edit and drag-to-move text overlays
- **Smooth Animations**: Powered by React Native Reanimated
- **Responsive Design**: Works seamlessly on iOS and Android

## 🛠️ Tech Stack

- **Frontend**: React Native with Expo
- **Routing**: Expo Router (file-based routing)
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Backend**: Supabase (PostgreSQL database, authentication, storage)
- **State Management**: Zustand
- **Animations**: React Native Reanimated & Gesture Handler
- **Image Processing**: React Native Skia, Photo Manipulator
- **Camera**: Expo Camera

## 📱 Quick Start with Expo Go

### Prerequisites
- Node.js (v18 or later)
- npm or yarn
- Expo Go app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) | [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
- Supabase account

### 1. Clone the Repository
```bash
git clone https://github.com/NoaheCampbell/SnapClone.git
cd SnapClone
```

### 2. Install Dependencies
```bash
npm install
# or
yarn install
```

### 3. Set Up Supabase

#### Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key from the project settings

#### Configure Database
1. In your Supabase dashboard, go to the SQL Editor
2. Run the migration files in order from the `supabase/migrations/` folder:
   - `20240610120000_initial_schema.sql`
   - `20250101120000_create_message_reads.sql`
   - `20250101130000_add_privacy_settings.sql`
   - `20250101150000_enable_message_reads_realtime.sql`
   - `20250624043841_create_get_user_chats_function.sql`
   - `20250624060000_update_stories_schema.sql`
   - `20250624060500_update_stories_policy.sql`
   - `20250624061000_storage_policy_stories.sql`

#### Configure Authentication
1. In Supabase dashboard, go to Authentication → Providers
2. **Important**: Turn OFF "Confirm email" for the Email provider
3. Configure any additional auth providers if needed

#### Set Up Storage
1. Go to Storage in your Supabase dashboard
2. Create the following buckets:
   - `chat-media` (for avatars and chat images)
   - `stories` (for story content)
3. Set appropriate policies for public access

### 4. Configure Environment Variables

Create a `lib/supabase.ts` file with your Supabase credentials:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```
### 5. Open in Expo Go
1. Open the Expo Go app on your phone
2. Scan the QR code displayed in your terminal/browser
3. The app will load on your device

## 🚀 Development Setup

### For Full Development (with simulators)
```bash
# Install Expo CLI globally
npm install -g @expo/cli

# Start development server
npx expo start

# Run on iOS simulator (macOS only)
npx expo run:ios

# Run on Android emulator
npx expo run:android
```

### Building for Production
```bash
# Install EAS CLI
npm install -g @expo/eas-cli

# Configure EAS
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

## 📁 Project Structure

```
SnapClone/
├── src/
│   ├── app/                    # Expo Router pages
│   │   ├── (auth)/            # Authentication screens
│   │   ├── (modals)/          # Modal screens
│   │   ├── (tabs)/            # Main tab screens
│   │   └── stories/           # Story viewing screens
│   ├── components/            # Reusable components
│   ├── contexts/              # React contexts (Auth, etc.)
│   ├── lib/                   # Utilities and configurations
│   └── types/                 # TypeScript type definitions
├── assets/                    # Images, fonts, and other assets
├── supabase/                  # Database migrations and policies
└── docs/                      # Documentation
```

## 🔧 Configuration

### Camera Permissions
The app requires camera permissions to function properly. These are automatically requested when the app starts.

### Storage Permissions
Media library permissions are required to save photos. These are requested when needed.

### API Keys (Optional)
For AI chat suggestions, you can add an OpenAI API key:
1. Go to Settings in the app
2. Tap "Manage API Key"
3. Enter your OpenAI API key

## 🐛 Troubleshooting

### Common Issues

**"Metro bundler error"**
```bash
npx expo start --clear
```

**"Camera not working"**
- Ensure camera permissions are granted
- Try restarting the Expo Go app
- Check that your device has a camera

**"Supabase connection issues"**
- Verify your Supabase URL and keys in `lib/supabase.ts`
- Check that your Supabase project is active
- Ensure RLS policies are properly configured

**"Text overlays not responding"**
- This is a known issue being worked on
- Try tapping more firmly or multiple times
- Restart the app if gestures stop working

### Development Tips

1. **Use Expo Go for quick testing** - fastest way to see changes
2. **Use development builds for native features** - when you need custom native code
3. **Check Supabase logs** - for backend debugging
4. **Use React Native Debugger** - for advanced debugging

## 📖 Documentation

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [Supabase Documentation](https://supabase.com/docs)
- [NativeWind Documentation](https://www.nativewind.dev/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Expo team for the amazing development platform
- Supabase for the backend infrastructure
- React Native community for the excellent libraries
- Snapchat for the inspiration

---

**Note**: This is a demo/learning project and not affiliated with Snapchat Inc. 