-- Fix the notify_circle_message_push function to use correct net.http_post signature

CREATE OR REPLACE FUNCTION public.notify_circle_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  tokens text[];
  token text;
  sender_name text;
  msg_body text;
begin
  -- Gather recipient tokens, skipping sender and muted members
  select array_agg(p.expo_push_token)
    into tokens
  from circle_members cm
  join profiles p on p.user_id = cm.user_id
  where cm.circle_id = new.circle_id
    and cm.user_id <> new.sender_id
    and coalesce(cm.mute_notifications,false) = false
    and p.expo_push_token is not null;

  if tokens is null then
    return new;
  end if;

  select username into sender_name from profiles where user_id = new.sender_id;
  if sender_name is null then sender_name := 'Someone'; end if;

  if new.content is null or new.content = '' then
    msg_body := 'Sent a photo';
  elsif length(new.content) > 100 then
    msg_body := substr(new.content, 1, 97) || '…';
  else
    msg_body := new.content;
  end if;

  foreach token in array tokens loop
    -- Use the correct net.http_post signature
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := jsonb_build_object(
        'to', token,
        'sound', 'default',
        'title', sender_name || ' in your circle',
        'body', msg_body
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Accept', 'application/json'
      )
    );
  end loop;
  return new;
end;
$$;
