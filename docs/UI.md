SnapConnect — Phase-1 UI Build Guide

This doc is a concise, ordered checklist that you can keep open while you code. Follow the steps in order; check them off as you go.

⸻

0 · Prereqs
	•	Dev Client installed on phone (npx expo run:ios --device done once)
	•	Terminal running Metro:

npx expo start --dev-client --tunnel   # or npm run dev



⸻

1 · Project folders (once)

src/
 ├─ app/
 │   ├─ (tabs)/
 │   │   ├─ camera.tsx
 │   │   ├─ inbox.tsx
 │   │   ├─ stories.tsx
 │   │   └─ friends.tsx
 │   └─ (modals)/
 │       ├─ send-to.tsx
 │       └─ settings.tsx
 ├─ components/
 ├─ hooks/
 └─ lib/

Why: Expo Router auto-registers screens by file path.

⸻

2 · .cursor rules (once)

Create .cursor/rules at the project root:

componentFolder: "src/components"
screenFolder: "src/app"
importAliases:
  "@/*": "./src/*"
tailwind: true

Why: Keeps Agent’s auto-imports & Tailwind styles consistent.

⸻

3 · Generate screens with Cursor Agent

Paste each prompt into Cursor chat. The Agent writes & saves code; Metro instantly reloads on the phone.

3.1 Camera tab

/agent Replace src/app/(tabs)/camera.tsx
with a VisionCamera screen:
- Full-screen <Camera>
- Top-right flash toggle
- Bottom-center ShutterButton (new component, 72 × 72)
- Tailwind styles, SafeAreaView

3.2 ShutterButton component

/agent Create src/components/ShutterButton.tsx:
- Props: isRecording:boolean, onPress:() => void
- 72 × 72, rounded-full, bg-white; bg-indigo-500 when recording
- shadow-md

3.3 Send-To bottom sheet

/agent Replace src/app/(modals)/send-to.tsx:
- BottomSheetModal (@gorhom/bottom-sheet)
- Search bar, FlatList friends (useFriendsStore())
- Checkbox icon; "Send" CTA disabled until ≥1 selected

3.4 Stories tab

/agent Replace src/app/(tabs)/stories.tsx:
- Horizontal ScrollView StoryRing components (size 64)
- FlatList autoplaying stories (expo-av)
- supabase.from('stories').select() where expires_at > now()

3.5 Theme toggle

/agent Create src/components/ThemeToggle.tsx:
- Detect scheme with useColorScheme()
- Toggle stores choice in MMKV 'colorScheme'
- Override NativeWindProvider

Add component to settings modal.

⸻

4 · Tailwind colour tokens

Token	Light	Dark
Glass card	bg-white/15	bg-neutral-900/40
Accent	#7B5CFF	same
Shadow	shadow-md	shadow-indigo-800/50


⸻

5 · Component look & feel reference
	•	ShutterButton: circular, subtle outer ring, enlarges to 80 px while recording.
	•	StoryRing: 64 × 64 image inside border-2 border-accent + gradient ring when unseen.
	•	Bottom bar: h-20 bg-white/10 backdrop-blur-lg border-t border-white/20.
	•	Snap bubble (chat): white bubble, auto-vanish animator (scale-down) after timer.

⸻

6 · Testing checklist
	•	Camera opens without red screen.
	•	Shutter captures photo → local preview.
	•	Send-To sheet lists at least one mock friend.
	•	Inbox updates via supabase Realtime listener.
	•	Dark-mode toggle switches instantly.

When these are all green, Phase-1 UI shell is done—hook up snap upload next.

⸻

Last updated: ${new Date().toLocaleDateString(‘en-US’)}. Feel free to tweak the file and re-run Agent prompts to iterate.