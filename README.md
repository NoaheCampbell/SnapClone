# SprintLoop - Study Sprint App 📚

A collaborative study app built with React Native and Expo that helps students stay focused and motivated through timed study sprints, AI-powered quizzes, and social accountability.

## ✨ Features

### 🏃‍♀️ Study Sprints
- **Timed Focus Sessions**: Create 1-180 minute study sprints with specific topics and goals
- **Sprint Photos**: Capture start/end photos to document your progress
- **Join Others**: See and join active sprints from your study circles
- **Threading**: Sprint messages create discussion threads for collaboration

### 👥 Study Circles
- **Private Groups**: Create circles for your study groups or classes
- **Public Discovery**: Find and join public study circles
- **Sprint Tracking**: See active sprints and member participation
- **Circle Streaks**: Track consecutive days of 60%+ member participation

### 🧠 AI-Powered Learning
- **Auto-Generated Quizzes**: Get AI-generated quizzes based on your sprint topic and goals
- **Concept Maps**: Visual concept maps generated from your study session
- **Performance Tracking**: Track quiz scores and identify knowledge gaps
- **Smart Suggestions**: Get personalized topic suggestions based on your history

### 🔥 Gamification & Streaks
- **Personal Streaks**: Track consecutive study days with freeze tokens
- **Circle Streaks**: Group accountability through collective streaks
- **Achievements**: Earn freeze tokens every 7-day streak
- **Reminders**: Daily push notifications to maintain streaks

### 💬 Real-time Chat
- **Circle Messaging**: Chat with study group members
- **Photo Sharing**: Share study materials and progress photos
- **Auto-Expiring Messages**: Messages expire after 24 hours to keep focus on current work
- **Message Reactions**: React with 👍🔥📚 emojis

### 🎨 Modern UI/UX
- **Dark Theme**: Eye-friendly dark mode for late-night study sessions
- **Smooth Animations**: Gesture-based interactions and transitions
- **Camera Integration**: Built-in camera for sprint photos
- **Responsive Design**: Works seamlessly on iOS and Android

## 🛠️ Tech Stack

- **Frontend**: React Native with Expo SDK 51
- **Routing**: Expo Router v3 (file-based routing)
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **AI Services**: OpenAI GPT-4 for quiz and concept map generation
- **State Management**: React Context API
- **Animations**: React Native Reanimated & Gesture Handler
- **Camera**: Expo Camera
- **Push Notifications**: Expo Notifications

## 📱 Quick Start

### Prerequisites
- Node.js (v18 or later)
- npm or yarn
- (Recommended) Expo Go app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) | [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
- Supabase account
- OpenAI API key (for AI features)

### 1. Clone the Repository
```bash
git clone https://github.com/NoaheCampbell/SnapClone.git
cd SnapClone
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Set Up Supabase

#### Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Save your project URL and anon key from Settings → API

#### Configure Database
1. In Supabase dashboard, go to SQL Editor
2. Run the complete schema migration:
   ```sql
   -- Copy and paste contents of:
   -- supabase/migrations/20250125000000_complete_consolidated_schema.sql
   ```
   This creates all tables, functions, indexes, and cron jobs

#### Configure Authentication
1. Go to Authentication → Providers
2. Enable Email provider
3. **Important**: Turn OFF "Confirm email" for development
4. Configure any additional providers (Google, etc.) if needed

#### Set Up Storage
1. Go to Storage and create these buckets:
   - `chat-media` (for sprint photos and chat images)
   - `sprints` (for sprint photos)
2. Set bucket to public or configure RLS policies as needed

#### Deploy Edge Functions
1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```
2. Link your project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
3. Set Edge Function secrets:
   ```bash
   supabase secrets set OPENAI_API_KEY=your_openai_api_key
   ```
4. Deploy all Edge Functions:
   ```bash
   supabase functions deploy
   ```

### 4. Configure Environment

Create or update `lib/supabase.ts`:
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'YOUR_SUPABASE_PROJECT_URL'
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

### 5. Start Development
```bash
# Start Expo development server
npx expo start

# For iOS Simulator (Mac only)
npx expo run:ios

# For Android Emulator
npx expo run:android
```

## 📁 Project Structure

```
SnapClone/
├── src/
│   ├── app/                    # Expo Router pages
│   │   ├── (auth)/            # Auth screens (login, signup, profile)
│   │   ├── (modals)/          # Modal screens (chat, settings, etc.)
│   │   ├── (tabs)/            # Main tabs (sprints, circles, inbox)
│   │   └── index.tsx          # Root redirect
│   ├── components/            # Reusable components
│   │   ├── SprintCamera.tsx   # Sprint photo capture
│   │   ├── QuizModal.tsx      # AI quiz interface
│   │   └── ConceptMapModal.tsx # Concept map viewer
│   ├── contexts/              # React contexts
│   └── lib/                   # Utilities and helpers
├── supabase/
│   ├── migrations/            # Database schema
│   └── functions/             # Edge Functions
│       ├── generateGapAwareQuiz/
│       ├── generateConceptMap/
│       ├── updateStreaksDaily/
│       └── sendStreakReminders/
├── assets/                    # Images and fonts
└── docs/                      # Documentation
```

## 🔧 Configuration

### Database Cron Jobs
The following cron jobs are automatically set up:
- **Message Cleanup**: Runs every minute to delete expired messages
- **Sprint Completion**: Runs every 5 minutes to mark completed sprints
- **Daily Streaks**: Runs at 02:05 UTC to update user and circle streaks
- **Streak Reminders**: Runs at 18:00 UTC to send push notifications

### Push Notifications
1. Configure Expo push notifications in `app.json`
2. Users need to allow notifications when prompted
3. Push tokens are automatically saved to user profiles

### OpenAI Integration
The app uses OpenAI for:
- Generating quiz questions based on study topics
- Creating concept maps from study sessions
- Suggesting next study topics

## 🚀 Deployment

### Building for Production

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```

2. Configure EAS:
   ```bash
   eas build:configure
   ```

3. Update `app.json` with your bundle identifier

4. Build:
   ```bash
   # iOS
   eas build --platform ios

   # Android  
   eas build --platform android
   ```

### Environment Variables
For production builds, set these in EAS secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 🐛 Troubleshooting

### Common Issues

**"Streaks not updating"**
- Check that the `last_completed_local_date` field exists in the streaks table
- Verify cron jobs are running in Supabase dashboard
- Ensure Edge Functions are deployed

**"Threading not working"**
- Verify `thread_root_id` is properly set on messages
- Check that sprint messages are creating root threads
- Look for errors in Supabase logs

**"Quiz generation failing"**
- Verify OpenAI API key is set in Edge Function secrets
- Check Edge Function logs for errors
- Ensure sprint has topic and goals defined

**"Camera not working"**
- Grant camera permissions when prompted
- For iOS: Check Settings → Privacy → Camera
- For Android: Check App Info → Permissions

### Development Tips

1. **Use Expo Go** for rapid development
2. **Check Supabase Logs** for database and Edge Function errors
3. **Enable Realtime** for tables in Supabase dashboard
4. **Test on real devices** for camera and push notifications

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Expo team for the excellent development platform
- Supabase for the real-time backend infrastructure
- OpenAI for powering the AI features
- React Native community for amazing libraries

---

**Note**: This is an educational project demonstrating modern mobile app development with AI integration. 