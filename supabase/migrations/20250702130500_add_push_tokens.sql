-- Migration: add push token and reminder helper

-- 1. Column for Expo push token
alter table if exists profiles
  add column if not exists expo_push_token text;

-- 2. Helper function to fetch users needing reminder (see code doc)
create or replace function public.get_users_needing_reminder(now_iso text)
returns setof profiles
language plpgsql
security definer
as $$
declare
  v_now timestamp := now_iso::timestamptz;
begin
  return query
  select p.*
  from profiles p
  join streaks s on s.user_id = p.user_id
  where s.current_len >= 3
    and p.expo_push_token is not null
    and (
      date_trunc('minute', (v_now at time zone coalesce(p.timezone,'UTC')))
        between date_trunc('minute', (v_now at time zone coalesce(p.timezone,'UTC'))::date + interval '18 hours')
            and date_trunc('minute', (v_now at time zone coalesce(p.timezone,'UTC'))::date + interval '18 hours 5 minutes')
    )
    and not exists (
      select 1 from sprints sp
      where sp.user_id = p.user_id
        and sp.counts_for_streak = true
        and sp.ends_at >= (v_now at time zone coalesce(p.timezone,'UTC'))::date
    );
end $$; 