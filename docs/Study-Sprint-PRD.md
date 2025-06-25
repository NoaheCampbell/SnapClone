SprintLoop – Product Requirements Document (PRD)

Last updated: 2025-06-24

⸻

1  Project Overview

SnapStudy is a mobile, Snapchat‑style accountability app for study‑sprint circles. Members start a Pomodoro‑length sprint by snapping a desk photo, recording what they plan to study (Topic + Tags). The app overlays a live countdown ring, optionally shares progress with a private circle, and auto‑deletes the snap when the sprint (plus grace) ends. AI helpers then turn the notes into summaries, concept‑map PNGs, and multiple‑choice quizzes.

⸻

2  Target Audience
	•	University & college study Discord servers
	•	Self‑taught developers preparing for exams/interviews
	•	ADHD learners who benefit from body‑double focus sessions

⸻

3  Key Features (v0 MVP)

3.1  Core Sprint Flow
	•	Topic & Tags Input (new)
	•	User enters a Topic (required) and optional Tags before snapping.
	•	Create / Join Circles
	•	Visibility public (discoverable) or private (invite code)
	•	Owner sets sprint_minutes (default 25) and ttl_minutes (default 30)
	•	Snap‑to‑Start
	•	Capture desk photo (or optional 5‑s video)
	•	App stores started_at, ends_at, topic, tags
	•	Timer Overlay (Edge Function ▫ Sharp) – circular progress ring
	•	Real‑Time Countdown (Circle mode) – Supabase channel emits remaining ms every 5 s
	•	Ephemeral Reel – most‑recent active snap per member; disappears at ends_at
	•	Auto‑Purge – Cron every 30 min deletes expired rows/media

3.2  AI Helpers (included in v0)
	1.	OCR → Summary
	2.	Concept‑Map PNG
	3.	MCQ Quiz Generator (stores score per sprint)

3.3  Gamified Streak System
	•	Individual streak + freeze token
	•	Group streak (≥ 60 % members active)
	•	Push reminder at 18:00 local if streak ≥ 3 and no sprint today

3.4  Social Layer
	•	Reaction emojis 👍 🔥 📚 (disappear with snap)
	•	Discover tab for public circles

⸻

4  Design Guidelines
	•	Dark, calming palette
	•	Circular timer ring prominent
	•	Minimal chrome while timer runs

⸻

5  Database Schema (no RLS)

-- circles
id uuid PK, name text, owner uuid, sprint_minutes int default 25,
ttl_minutes int default 30, visibility text check ('public','private')

-- circle_members
circle_id uuid FK, user_id uuid FK, role text default 'member'

-- sprints
id uuid PK, circle_id FK, user_id FK, media_url text,
started_at timestamptz default now(), ends_at timestamptz,
topic text not null,                               -- NEW
tags text[],                                      -- NEW
ai_summary_id uuid nullable

-- summaries
id uuid PK, sprint_id FK UNIQUE, bullets text[], concept_map_url text,
created_at timestamptz default now()

-- quizzes
id uuid PK, summary_id FK UNIQUE, mcq_json jsonb not null,
created_at timestamptz

-- quiz_attempts  (NEW table – one row per user attempt)
id uuid PK default gen_random_uuid(),
quiz_id uuid references public.quizzes(id) on delete cascade,
user_id uuid references auth.users(id) on delete cascade,
score smallint not null,
answers jsonb,                      -- optional: user selected options
attempted_at timestamptz default now()

-- streaks
user_id uuid PK, current_len int default 0, best_len int default 0,
freeze_tokens int default 1, token_regen_at timestamptz


⸻

6  Backend Components (plain list)
	•	overlayTimer.ts – Storage trigger, Sharp ring overlay, updates sprints.media_url
	•	ocrSummarise.ts – OCR → bullets → concept‑map → quiz (stores into summaries, quizzes)
	•	purgeExpiredSprints.ts – pg_cron (*/30 min) deletes expired rows & media
	•	streakDailyJob.ts – pg_cron daily 00:05 UTC resets streaks, regenerates freeze tokens, schedules push reminder