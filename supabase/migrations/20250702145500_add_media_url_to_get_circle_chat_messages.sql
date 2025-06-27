BEGIN;

-- Update get_circle_messages to include media_url so the mobile app can render images and videos after reloads
CREATE OR REPLACE FUNCTION public.get_circle_messages(p_circle_id uuid)
RETURNS TABLE (
    id bigint,
    content text,
    media_url text,
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
    -- Reject users who are not members of the circle
    IF NOT EXISTS (
        SELECT 1 FROM public.circle_members cm
        WHERE cm.circle_id = p_circle_id
          AND cm.user_id  = auth.uid()
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        m.id,
        m.content,
        m.media_url,
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

-- Wrapper for legacy mobile code: get_chat_messages delegates to the circle version
CREATE OR REPLACE FUNCTION public.get_chat_messages(p_channel_id uuid)
RETURNS TABLE (
    id bigint,
    content text,
    media_url text,
    sender_id uuid,
    created_at timestamptz,
    sender_name text,
    is_own_message boolean
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT * FROM public.get_circle_messages(p_channel_id);
$$;

-- Ensure client roles can still execute these RPCs
GRANT EXECUTE ON FUNCTION public.get_circle_messages(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_messages(uuid)  TO authenticated, anon;

COMMIT; 