# SnapStudy – Second‑Brain Outline

## 1 Purpose

**Problem.** Learners struggle to stay focused, measure progress, and review material efficiently. Timer‑only apps don’t capture *what* you studied; note apps miss accountability.

**Why it matters.** Consistent practice + immediate feedback yields better retention (testing effect) and habit formation.

**Scope.** One‑tap **Sprint** (photo + timer) → AI recap (summary, concept map, quiz) → optional Circle sharing → streaks.

**Not building in v0.** Full note editor, live AR filters, in‑app spaced repetition, global leaderboard, complex RLS.

---

## 2 Experts

| Expert                | Why listen                      | Insight                               |
| --------------------- | ------------------------------- | ------------------------------------- |
| **Francesco Cirillo** | Invented Pomodoro               | Visible timer, fixed length.          |
| **Barbara Oakley**    | Neuroscience of learning        | Sprint + break aids consolidation.    |
| **Cal Newport**       | Deep Work advocate              | UI must hide distractions.            |
| **Ali Abdaal**        | Popular "study with me" streams | Social presence boosts focus.         |
| **Kathy Sierra**      | Cognitive scaffolding           | Instant feedback beats raw time logs. |

---

## 3 Spiky POVs

1. Visual proof > passive timers.
2. Ephemerality lowers sharing anxiety.
3. Summary → Concept Map → Quiz within 10 s = unique learning loop.
4. Freeze tokens kinder than hard streak resets.
5. Ship fast—add RLS later.

---

## 4 Knowledge Tree

### Technical

* **Mobile** – Expo RN, expo-camera, Skia animation.
* **Backend** – Supabase Postgres, Storage, Edge Functions.

  * `overlayTimer.ts`  (Sharp ring)
  * `ocrSummarise.ts` (GPT‑4o Vision, Mermaid CLI, quiz)
  * `streakDailyJob.ts` (streak rollover, push)
* **AI** – OpenAI GPT‑4o Vision, prompt engineering, Mermaid CLI→PNG.
* **DevOps** – Supabase migrations, TestFlight deploy, Sentry.

### Product & Design

* Habit loops, streak psychology.
* Minimalist focus UX.
* Privacy (GDPR / FERPA).
* Future export pipeline (.csv → Anki).

### Open Questions

* Best push‑notif cost (Expo vs OneSignal).
* Deno memory limits for Sharp + Mermaid.
* Vision API cost vs # snaps.
