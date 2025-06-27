BEGIN;

-- Ensure we can change the function signature by dropping the old versions first
DROP FUNCTION IF EXISTS public.get_chat_messages(uuid);
DROP FUNCTION IF EXISTS public.get_circle_messages(uuid);

-- Recreate get_circle_messages with media_url column
CREATE FUNCTION public.get_circle_messages(p_circle_id uuid)
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
    -- User must be a member of the circle
    IF NOT EXISTS (
        SELECT 1 FROM public.circle_members cm
        WHERE cm.circle_id = p_circle_id AND cm.user_id = auth.uid()
    ) THEN
        RETURN; -- empty set for non-members
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

-- Legacy wrapper expected by mobile code
CREATE FUNCTION public.get_chat_messages(p_channel_id uuid)
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

-- Permissions
GRANT EXECUTE ON FUNCTION public.get_circle_messages(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_messages(uuid)  TO authenticated, anon;

COMMIT; 