-- Drop existing function first to allow return type change
drop function if exists public.get_chat_messages(uuid);

-- Update get_chat_messages to return join_count and only root/thread-head messages
-- Also join with profiles to get sender info including avatar
create or replace function public.get_chat_messages(p_channel_id uuid)
returns table (
  id bigint,
  circle_id uuid,
  channel_id uuid,
  sender_id uuid,
  content text,
  media_url text,
  sprint_id uuid,
  thread_root_id bigint,
  join_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  deleted boolean,
  sender_name text,
  avatar_url text
)
language sql
stable
as $$
  select 
    m.id,
    m.circle_id,
    m.channel_id,
    m.sender_id,
    m.content,
    m.media_url,
    m.sprint_id,
    m.thread_root_id,
    m.join_count,
    m.created_at,
    m.updated_at,
    m.deleted,
    p.username as sender_name,
    p.avatar_url
  from public.messages m
  join public.profiles p on p.user_id = m.sender_id
  where (m.channel_id = p_channel_id or m.circle_id = p_channel_id)
    and (m.thread_root_id is null or m.thread_root_id = m.id)
  order by m.created_at asc;
$$; 