BEGIN;

-- Add channel_id column for backward compatibility with existing mobile code
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS channel_id uuid;

-- Sync channel_id and circle_id both directions
CREATE OR REPLACE FUNCTION public.sync_message_channel_circle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.channel_id IS NULL AND NEW.circle_id IS NOT NULL THEN
      NEW.channel_id := NEW.circle_id;
    ELSIF NEW.circle_id IS NULL AND NEW.channel_id IS NOT NULL THEN
      NEW.circle_id := NEW.channel_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.channel_id IS DISTINCT FROM OLD.channel_id THEN
      NEW.circle_id := NEW.channel_id;
    ELSIF NEW.circle_id IS DISTINCT FROM OLD.circle_id THEN
      NEW.channel_id := NEW.circle_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_message_channel_circle ON public.messages;
CREATE TRIGGER trg_sync_message_channel_circle
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.sync_message_channel_circle();

-- Back-fill existing rows (if any)
UPDATE public.messages SET channel_id = circle_id WHERE channel_id IS NULL;

-- ----------------------------------------------
-- Backward-compatibility RPC wrappers
-- ----------------------------------------------

-- 1. get_chat_messages -> delegates to get_circle_messages
CREATE OR REPLACE FUNCTION public.get_chat_messages(p_channel_id uuid)
RETURNS TABLE (
    id bigint,
    content text,
    sender_id uuid,
    created_at timestamptz,
    sender_name text,
    is_own_message boolean
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT * FROM public.get_circle_messages(p_channel_id);
$$;

-- 2. get_chat_details -> transforms get_circle_details
CREATE OR REPLACE FUNCTION public.get_chat_details(p_channel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    details jsonb;
BEGIN
    details := public.get_circle_details(p_channel_id);

    -- Build legacy shape: { is_group, participants: [ {user_id, username} ] }
    RETURN jsonb_build_object(
        'is_group', true,
        'participants', details -> 'members'
    );
END;
$$;

-- 3. get_user_chats() – legacy list of circles the user is in
CREATE OR REPLACE FUNCTION public.get_user_chats()
RETURNS TABLE (
    id uuid,
    is_group boolean,
    participants jsonb
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT 
        c.id,
        true  AS is_group,
        (SELECT jsonb_agg(jsonb_build_object('user_id', p.user_id, 'username', p.username))
         FROM public.circle_members cm2
         JOIN public.profiles p ON p.user_id = cm2.user_id
         WHERE cm2.circle_id = c.id
           AND cm2.user_id <> auth.uid()
        ) AS participants
    FROM public.circles c
    JOIN public.circle_members cm ON cm.circle_id = c.id
    WHERE cm.user_id = auth.uid();
$$;

-- Grant exec to client roles
GRANT EXECUTE ON FUNCTION public.get_chat_messages(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_details(uuid)  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_chats()        TO authenticated, anon;

-- end wrappers

COMMIT; 