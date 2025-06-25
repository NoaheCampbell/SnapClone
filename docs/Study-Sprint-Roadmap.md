# Study-Sprint Backend Roadmap

_Last updated: 2025-07-01_

This roadmap translates `Study-Sprint-PRD.md` into concrete backend work packages delivered in phases. Each phase is self-contained and deployable so we can iterate quickly and validate functionality incrementally.

---

## Phase 0  – Setup & Hygiene 💼

| ID | Task |
|----|------|
| 0-1 | Repository clean-up (remove any lingering mock references in docs) |
| 0-2 | Supabase guard-rails – enable Row Level Security by default; enable **pgCron** extension | 

---

## Phase 1  – Database & Auth Foundations 🗄️

**Goal:** establish all schema objects that subsequent phases depend on.

### Tables / Migrations
- `circles`  (owner FK → `auth.users`)
- `circle_members`  (composite PK `circle_id + user_id`)
- `sprints`  (+ `topic`, `tags`, `ends_at`, `media_url`, `ai_summary_id`)
- `summaries`  (1-to-1 with sprint)
- `quizzes`  (1-to-1 with summary)
- `quiz_attempts`  (many-to-1 quizzes)
- `streaks`  (per user)

### Other
- Extensions: `pgcrypto`, `pgCron`, `realtime`
- Storage bucket `sprints` (public read, signed upload) + open policy for MVP
- No RLS

**Deliverables**
```
supabase/migrations/20250701090000_initial_study_sprint_schema.sql
supabase/storage-policies/sprints_bucket.sql
```

---

## Phase 2  – Core Sprint Flow ⏱️

| Feature | Component | Notes |
|---------|-----------|-------|
| Snap-to-Start | Edge function `startSprint.ts` | Validate membership, insert sprint row, return presigned upload URL |
| Timer overlay | Storage hook `overlayTimer.ts` | Sharp draws circular progress ring onto uploaded image |
| Realtime countdown | `circle-{id}` channel | Broadcast `{ sprint_id, msLeft }` every 5 s |
| Ephemeral reel view | SQL view `active_snaps` | Shows most-recent active snap per member |
| Auto-purge job | `pgCron` every 30 min | Delete expired rows & media |

**Deliverables**
```
supabase/functions/startSprint.ts
supabase/functions/overlayTimer.ts
supabase/sql/active_snaps_view.sql
supabase/sql/cron_purge_sprints.sql
```

---

## Phase 3  – AI Helpers Pipeline 🤖

| Step | Tool | Output |
|------|------|--------|
| OCR → bullets | `ocrSummarise.ts` | `summaries.bullets` |
| Concept map PNG | `ocrSummarise.ts` | `summaries.concept_map_url` stored in Storage |
| MCQ quiz | same fn | JSON stored in `quizzes.mcq_json` |
| Push notification | Edge call | "Your summary & quiz are ready" |

---

## Phase 4  – Gamified Streak System 🔥

- Daily cron `streakDailyJob.ts` @ 00:05 UTC
  - Reset `current_len` if no sprint in last 24 h
  - Regenerate `freeze_tokens` (max 3)
  - Schedule evening push reminder (18:00 local) when streak ≥ 3
- Group streaks: materialised view refreshed daily

**Deliverables**
```
supabase/sql/cron_streaks.sql
supabase/functions/streakDailyJob.ts
```

---

## Phase 5  – Social Layer 🎉

| Feature | Details |
|---------|---------|
| Reaction emojis | Table `sprint_reactions (sprint_id, user_id, emoji, created_at)` TTL-aligned with sprint |
| Discover public circles | View `discover_circles` (visibility = public, order by active-members desc) |

---

## Phase 6  – Hardening & RLS Lock-down 🔒

- Replace permissive policies with least-privilege rules
- Rate-limit Edge functions
- WAL-level triggers if cross-region replication needed

---

### How to Begin
1. Create **Phase 1 migration** and push: `supabase db push`
2. Create Storage bucket + policy script, commit.
3. Regenerate types: `supabase gen types typescript --project-id <id> > database.types.ts`
4. Smoke-test with Expo app pointing at local Supabase.

Once Phase 1 is merged, we'll implement Phase 2 functions & triggers. 