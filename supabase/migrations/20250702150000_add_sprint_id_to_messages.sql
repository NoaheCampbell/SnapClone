BEGIN;

-- 1. Add sprint_id column to messages to link a chat message to a sprint
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sprint_id uuid REFERENCES public.sprints(id) ON DELETE SET NULL;

-- Helpful index for querying messages of a sprint
CREATE INDEX IF NOT EXISTS idx_messages_sprint_id ON public.messages(sprint_id);

-- 2. Update RPCs to include sprint_id in their result sets
DROP FUNCTION IF EXISTS public.get_chat_messages(uuid);
DROP FUNCTION IF EXISTS public.get_circle_messages(uuid);

CREATE FUNCTION public.get_circle_messages(p_circle_id uuid)
RETURNS TABLE (
    id bigint,
    content text,
    media_url text,
    sprint_id uuid,
    sender_id uuid,
    created_at timestamptz,
    sender_name text,
    is_own_message boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Authorization: must belong to circle
    IF NOT EXISTS (
        SELECT 1 FROM public.circle_members cm
        WHERE cm.circle_id = p_circle_id AND cm.user_id = auth.uid()
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        m.id,
        m.content,
        m.media_url,
        m.sprint_id,
        m.sender_id,
        m.created_at,
        p.username AS sender_name,
        (m.sender_id = auth.uid()) AS is_own_message
    FROM public.messages m
    JOIN public.profiles p ON p.user_id = m.sender_id
    WHERE m.circle_id = p_circle_id
    ORDER BY m.created_at ASC;
END;
$$;

-- Legacy compatibility wrapper
CREATE FUNCTION public.get_chat_messages(p_channel_id uuid)
RETURNS TABLE (
    id bigint,
    content text,
    media_url text,
    sprint_id uuid,
    sender_id uuid,
    created_at timestamptz,
    sender_name text,
    is_own_message boolean
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT * FROM public.get_circle_messages(p_channel_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_circle_messages(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_messages(uuid)  TO authenticated, anon;

COMMIT; 