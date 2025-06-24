-- Migration: update stories schema to include seen_by array and rename owner_id to user_id, drop story_views table

-- 1. Rename owner_id to user_id
alter table if exists stories
  rename column owner_id to user_id;

-- 2. Add seen_by uuid[] column if not already present
alter table stories
  add column if not exists seen_by uuid[] default array[]::uuid[];

-- 3. Constrain media_type to enum values
alter table stories
  alter column media_type type text using media_type::text,
  add constraint stories_media_type_check check (media_type in ('image','video'));

-- 4. Update RLS policies (reuse existing): ensure owner can manage row
-- Existing policy still references owner_id; drop and recreate

drop policy if exists "Stories: owner can manage" on stories;
create policy "Stories: owner can manage" on stories
  using ( auth.uid() = user_id );

-- 5. Drop story_views table (no longer needed)
drop table if exists story_views cascade; 