-- Migration: add privacy settings to profiles table
-- Run with SQL editor in Supabase dashboard

-- Add privacy columns to profiles table
alter table profiles 
add column if not exists is_private boolean default false,
add column if not exists allow_friend_requests boolean default true,
add column if not exists show_last_active boolean default true,
add column if not exists show_stories_to_friends_only boolean default false; 