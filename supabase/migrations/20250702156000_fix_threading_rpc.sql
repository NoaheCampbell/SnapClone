-- Fix threading RPC to create individual join messages in thread
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
    v_new_id bigint;
begin
  -- look for an existing root message for this sprint in the circle
  select id into v_root_id
  from public.messages
  where circle_id = p_circle_id
    and sprint_id = p_sprint_id
    and thread_root_id = id
  limit 1;

  if v_root_id is not null then
    -- someone already announced the sprint → create threaded reply + bump counter
    insert into public.messages (circle_id, sender_id, sprint_id, content, media_url, thread_root_id)
    values (p_circle_id, p_user_id, p_sprint_id, p_content, p_media_url, v_root_id);
    
    update public.messages
    set join_count = join_count + 1,
        updated_at = now()
    where id = v_root_id;
  else
    -- first announcement → insert and immediately set as root of its own thread
    insert into public.messages (circle_id, sender_id, sprint_id, content, media_url, join_count)
    values (p_circle_id, p_user_id, p_sprint_id, p_content, p_media_url, 1)
    returning id into v_new_id;
    
    -- Update the thread_root_id to point to itself
    update public.messages 
    set thread_root_id = v_new_id
    where id = v_new_id;
  end if;
end;
$$; 