## Database Schema

The following SQL can be executed in Supabase (SQL Editor or CLI) to create the core tables, storage buckets, and row-level-security (RLS) policies for the SnapClone MVP.  All tables live in the `public` schema; users themselves are managed automatically by Supabase in `auth.users`.

> Tip: copy everything inside the ```sql block and run it in one batch.

```sql
-- Enable the pgcrypto extension for gen_random_uuid()
create extension if not exists pgcrypto;

/*──────────────────────────────────────────────
  1. profiles  (1-to-1 with auth.users)
──────────────────────────────────────────────*/
create table if not exists profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  username     text unique not null,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  last_active  timestamptz
);

alter table profiles enable row level security;

create policy "Profiles: user can manage their row" on profiles
  for all using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

/*──────────────────────────────────────────────
  2. friend_requests & friends
──────────────────────────────────────────────*/
create table if not exists friend_requests (
  id         bigserial primary key,
  from_id    uuid not null references profiles (user_id) on delete cascade,
  to_id      uuid not null references profiles (user_id) on delete cascade,
  status     text not null check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now()
);

alter table friend_requests enable row level security;
create policy "FriendRequests: requester or recipient" on friend_requests
  for select using ( auth.uid() in (from_id, to_id) );

create table if not exists friends (
  user_id    uuid not null references profiles (user_id) on delete cascade,
  friend_id  uuid not null references profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

alter table friends enable row level security;
create policy "Friends: either side sees link" on friends
  for select using ( auth.uid() in (user_id, friend_id) );

/*──────────────────────────────────────────────
  3. snaps & snap_recipients
──────────────────────────────────────────────*/
create table if not exists snaps (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles (user_id) on delete cascade,
  media_url   text not null,
  media_type  text not null check (media_type in ('image','video')),
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

alter table snaps enable row level security;
create policy "Snaps: owner can manage" on snaps
  using ( auth.uid() = owner_id );

create table if not exists snap_recipients (
  snap_id      uuid references snaps (id) on delete cascade,
  recipient_id uuid references profiles (user_id) on delete cascade,
  opened_at    timestamptz,
  screenshot   boolean default false,
  primary key (snap_id, recipient_id)
);

alter table snap_recipients enable row level security;
create policy "SnapRecipients: recipient or owner" on snap_recipients
  for select using (
    auth.uid() = recipient_id or
    auth.uid() = (select owner_id from snaps where id = snap_id)
  );

/*──────────────────────────────────────────────
  4. stories & story_views
──────────────────────────────────────────────*/
create table if not exists stories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles (user_id) on delete cascade,
  media_url   text not null,
  media_type  text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours')
);

alter table stories enable row level security;
create policy "Stories: owner can manage" on stories
  using ( auth.uid() = owner_id );

create table if not exists story_views (
  story_id  uuid references stories (id) on delete cascade,
  viewer_id uuid references profiles (user_id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

alter table story_views enable row level security;
create policy "StoryViews: viewer or owner" on story_views
  for select using (
    auth.uid() = viewer_id or
    auth.uid() = (select owner_id from stories where id = story_id)
  );

/*──────────────────────────────────────────────
  5. chat: channels, channel_members, messages
──────────────────────────────────────────────*/
create table if not exists channels (
  id        uuid primary key default gen_random_uuid(),
  is_group  boolean default false,
  created_at timestamptz not null default now()
);

alter table channels enable row level security;

create table if not exists channel_members (
  channel_id uuid references channels (id) on delete cascade,
  member_id  uuid references profiles (user_id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (channel_id, member_id)
);

alter table channel_members enable row level security;
create policy "ChannelMembers: member can select" on channel_members
  for select using ( member_id = auth.uid() );

create policy "Channels: members can select" on channels
  for select using (
    id in (select channel_id from channel_members where member_id = auth.uid())
  );

create table if not exists messages (
  id         bigserial primary key,
  channel_id uuid not null references channels (id) on delete cascade,
  sender_id  uuid not null references profiles (user_id) on delete cascade,
  content    text,
  media_url  text,
  created_at timestamptz not null default now(),
  deleted    boolean default false
);

alter table messages enable row level security;
create policy "Messages: channel members" on messages
  for select using (
    channel_id in (select channel_id from channel_members where member_id = auth.uid())
  );

/*──────────────────────────────────────────────
  6. notifications (optional)
──────────────────────────────────────────────*/
create table if not exists notifications (
  id         bigserial primary key,
  user_id    uuid not null references profiles (user_id) on delete cascade,
  type       text not null,
  payload    jsonb,
  is_read    boolean default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;
create policy "Notifications: owner" on notifications
  for select using ( auth.uid() = user_id );

/*──────────────────────────────────────────────
  Storage bucket setup (run in dashboard UI):
    • avatars   — public read
    • snaps     — private, signed URLs (e.g., 30 sec)  
    • stories   — public, auto-delete after 24 h (via edge function or scheduled job)
──────────────────────────────────────────────*/
```

### How to apply
1. Open Supabase → SQL Editor, paste the full block above and run it.  
2. Create the three storage buckets with the permissions indicated.  
3. Confirm RLS is ON for every table (the script enables it and adds policies).  
4. Done — the backend foundation is ready!
