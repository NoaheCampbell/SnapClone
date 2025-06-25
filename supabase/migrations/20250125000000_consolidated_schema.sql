-- Consolidated Schema for SnapClone with Study Sprints
-- This replaces all previous migrations with a clean, current schema

BEGIN;

------------------------------------------------------------
-- 1. Extensions
------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "uuid-ossp";  -- uuid_generate_v4()

------------------------------------------------------------
-- 2. Core user tables
------------------------------------------------------------
-- Drop existing tables if they exist (in reverse dependency order)
DROP TABLE IF EXISTS quiz_attempts CASCADE;
DROP TABLE IF EXISTS quizzes CASCADE;
DROP TABLE IF EXISTS summaries CASCADE;
DROP TABLE IF EXISTS sprints CASCADE;
DROP TABLE IF EXISTS streaks CASCADE;
DROP TABLE IF EXISTS circle_members CASCADE;
DROP TABLE IF EXISTS circles CASCADE;
DROP TABLE IF EXISTS message_reads CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS channels CASCADE;
DROP TABLE IF EXISTS friendships CASCADE;
DROP TABLE IF EXISTS stories CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS friend_requests CASCADE;
DROP TABLE IF EXISTS friends CASCADE;

-- Drop any existing RPC functions
DROP FUNCTION IF EXISTS get_chat_messages(uuid, integer, integer);
DROP FUNCTION IF EXISTS get_user_chats();
DROP FUNCTION IF EXISTS get_circle_messages(uuid, integer, integer);
DROP FUNCTION IF EXISTS get_circle_details(uuid);
DROP FUNCTION IF EXISTS get_user_circles();

create table if not exists profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  username          text unique not null,
  display_name      text,
  avatar_url        text,
  bio               text,
  is_private        boolean default false,
  allow_friend_requests boolean default true,
  show_last_active  boolean default true,
  show_stories_to_friends_only boolean default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists friend_requests (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null references profiles(user_id) on delete cascade,
  to_id      uuid not null references profiles(user_id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique(from_id, to_id)
);

create table if not exists friends (
  user_id    uuid references profiles(user_id) on delete cascade,
  friend_id  uuid references profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

------------------------------------------------------------
-- 3. Stories (keep existing)
------------------------------------------------------------
create table if not exists stories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (user_id) on delete cascade,
  media_url   text not null,
  media_type  text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours')
);

create table if not exists story_views (
  story_id  uuid references stories (id) on delete cascade,
  viewer_id uuid references profiles (user_id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

------------------------------------------------------------
-- 4. Snaps (keep existing)  
------------------------------------------------------------
create table if not exists snaps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (user_id) on delete cascade,
  media_url   text not null,
  media_type  text not null check (media_type in ('image','video')),
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists snap_recipients (
  snap_id      uuid references snaps (id) on delete cascade,
  recipient_id uuid references profiles (user_id) on delete cascade,
  opened_at    timestamptz,
  screenshot   boolean default false,
  primary key (snap_id, recipient_id)
);

------------------------------------------------------------
-- 5. Circles (study groups) - NEW
------------------------------------------------------------
create table if not exists circles (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  owner           uuid not null references profiles(user_id) on delete cascade,
  sprint_minutes  int  not null default 25,
  ttl_minutes     int  not null default 30,
  visibility      text not null check (visibility in ('public','private')),
  created_at      timestamptz not null default now()
);

create table if not exists circle_members (
  circle_id uuid not null references circles(id) on delete cascade,
  user_id   uuid not null references profiles(user_id) on delete cascade,
  role      text not null default 'member',
  joined_at timestamptz default now(),
  primary key (circle_id, user_id)
);

------------------------------------------------------------
-- 6. Messages (now linked to circles)
------------------------------------------------------------
create table if not exists messages (
  id         bigserial primary key,
  circle_id  uuid references circles (id) on delete cascade,
  sender_id  uuid not null references profiles (user_id) on delete cascade,
  content    text,
  media_url  text,
  created_at timestamptz not null default now(),
  deleted    boolean default false
);

create table if not exists message_reads (
  message_id  bigint references messages(id) on delete cascade,
  reader_id   uuid   references profiles(user_id) on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (message_id, reader_id)
);

------------------------------------------------------------
-- 7. DM channels (keep minimal for 1-to-1 chats)
------------------------------------------------------------
create table if not exists channels (
  id        uuid primary key default gen_random_uuid(),
  is_group  boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists channel_members (
  channel_id uuid references channels (id) on delete cascade,
  member_id  uuid references profiles (user_id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (channel_id, member_id)
);

------------------------------------------------------------
-- 8. Study Sprint tables
------------------------------------------------------------
create table if not exists sprints (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid references circles(id) on delete cascade,
  user_id       uuid references profiles(user_id) on delete cascade,
  media_url     text,
  started_at    timestamptz not null default now(),
  ends_at       timestamptz not null,
  topic         text not null,
  tags          text[],
  ai_summary_id uuid unique,
  created_at    timestamptz not null default now()
);

create table if not exists summaries (
  id              uuid primary key default gen_random_uuid(),
  sprint_id       uuid unique references sprints(id) on delete cascade,
  bullets         text[],
  concept_map_url text,
  created_at      timestamptz not null default now()
);

create table if not exists quizzes (
  id         uuid primary key default gen_random_uuid(),
  summary_id uuid unique references summaries(id) on delete cascade,
  mcq_json   jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid references quizzes(id) on delete cascade,
  user_id      uuid references profiles(user_id) on delete cascade,
  score        smallint not null,
  answers      jsonb,
  attempted_at timestamptz not null default now()
);

create table if not exists streaks (
  user_id        uuid primary key references profiles(user_id) on delete cascade,
  current_len    int  not null default 0,
  best_len       int  not null default 0,
  freeze_tokens  int  not null default 1,
  token_regen_at timestamptz,
  updated_at     timestamptz not null default now()
);

------------------------------------------------------------
-- 9. Notifications
------------------------------------------------------------
create table if not exists notifications (
  id         bigserial primary key,
  user_id    uuid not null references profiles (user_id) on delete cascade,
  type       text not null,
  payload    jsonb,
  is_read    boolean default false,
  created_at timestamptz not null default now()
);

------------------------------------------------------------
-- 10. Indexes
------------------------------------------------------------
create index if not exists idx_messages_circle_id on messages(circle_id);
create index if not exists idx_messages_sender_id on messages(sender_id);
create index if not exists idx_messages_created_at on messages(created_at);

create index if not exists idx_sprints_circle on sprints(circle_id);
create index if not exists idx_sprints_user on sprints(user_id);
create index if not exists idx_circle_members_user on circle_members(user_id);
create index if not exists idx_quiz_attempts_quiz on quiz_attempts(quiz_id);
create index if not exists idx_quiz_attempts_user on quiz_attempts(user_id);

create index if not exists idx_friends_user_id on friends(user_id);
create index if not exists idx_friends_friend_id on friends(friend_id);
create index if not exists idx_stories_user_id on stories(user_id);
create index if not exists idx_stories_expires_at on stories(expires_at);
create index if not exists idx_snaps_user_id on snaps(user_id);
create index if not exists idx_snaps_expires_at on snaps(expires_at);

------------------------------------------------------------
-- 11. No RLS (as per PRD requirements)
------------------------------------------------------------
-- RLS disabled for simplicity per Study Sprint PRD

COMMIT; 