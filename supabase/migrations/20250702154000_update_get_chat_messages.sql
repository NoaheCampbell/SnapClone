-- Drop existing function first to allow return type change
drop function if exists public.get_chat_messages(uuid);

-- Update get_chat_messages to return join_count and only root/thread-head messages
create or replace function public.get_chat_messages(p_channel_id uuid)
returns setof public.messages
language sql
stable
as $$
  select *
  from public.messages
  where (channel_id = p_channel_id or circle_id = p_channel_id)
    and (thread_root_id is null or thread_root_id = id)
  order by created_at asc;
$$; 