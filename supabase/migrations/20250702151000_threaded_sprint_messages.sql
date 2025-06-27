-- Add threading support & join counter for sprint start messages
-- Adds columns to messages table and creates helper function upsert_sprint_message

-- 1. Schema changes ---------------------------------------------------------
alter table public.messages
    add column if not exists thread_root_id bigint references public.messages(id) on delete cascade,
    add column if not exists join_count integer not null default 1;

create index if not exists messages_thread_root_idx on public.messages(thread_root_id);

-- Back-fill existing sprint messages so they reference themselves
update public.messages
set thread_root_id = id
where sprint_id is not null
  and thread_root_id is null;

-- 2. Helper function --------------------------------------------------------
create or replace function public.upsert_sprint_message(
    p_circle_id  uuid,
    p_user_id    uuid,
    p_sprint_id  uuid,
    p_content    text,
    p_media_url  text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_root_id bigint;
begin
  -- look for an existing root message for this sprint in the circle
  select id into v_root_id
  from public.messages
  where circle_id = p_circle_id
    and sprint_id = p_sprint_id
    and thread_root_id = id
  limit 1;

  if v_root_id is not null then
    -- someone already announced the sprint → just bump the counter
    update public.messages
    set join_count = join_count + 1,
        updated_at = now()
    where id = v_root_id;
  else
    -- first announcement → insert and make it the root of its own thread
    insert into public.messages (circle_id, sender_id, sprint_id, content, media_url)
    values (p_circle_id, p_user_id, p_sprint_id, p_content, p_media_url)
    returning id into v_root_id;

    update public.messages
    set thread_root_id = v_root_id,
        join_count     = 1
    where id = v_root_id;
  end if;
end;
$$; 