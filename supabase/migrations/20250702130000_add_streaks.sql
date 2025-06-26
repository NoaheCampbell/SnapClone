-- Migration: Add streak support for users and circles
-- Adds user streak tracking, freeze tokens, timezone capture, and circle streak counters

-- 1. User timezone
alter table if exists profiles
  add column if not exists timezone text;

-- 2. User streaks table
create table if not exists public.streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_len integer not null default 0,
  best_len integer not null default 0,
  freeze_tokens integer not null default 0,
  last_completed_local_date date
);

-- 3. Sprint early-stop flag
alter table if exists sprints
  add column if not exists stopped_early boolean not null default false,
  add column if not exists counts_for_streak boolean not null default false;

-- 4. Circle streak counters
alter table if exists circles
  add column if not exists current_streak integer not null default 0,
  add column if not exists best_streak integer not null default 0;

-- Helpful indexes
create index if not exists idx_sprints_by_user_and_end ON sprints (user_id, ends_at);
create index if not exists idx_sprints_by_circle_and_end ON sprints (circle_id, ends_at); 