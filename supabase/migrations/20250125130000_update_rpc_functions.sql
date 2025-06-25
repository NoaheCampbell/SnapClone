-- Update RPC functions to work with circles instead of channels

-- Replace get_chat_messages with get_circle_messages
CREATE OR REPLACE FUNCTION get_circle_messages(p_circle_id uuid)
RETURNS TABLE (
    id bigint,
    content text,
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
    -- Security check: Ensure the current user is a member of the requested circle
    IF NOT EXISTS (
        SELECT 1
        FROM public.circle_members cm
        WHERE cm.circle_id = p_circle_id AND cm.user_id = auth.uid()
    ) THEN
        RETURN; -- If not a member, return an empty set
    END IF;

    -- If user is a member, return the messages for that circle
    RETURN QUERY
    SELECT
        m.id,
        m.content,
        m.sender_id,
        m.created_at,
        p.username AS sender_name,
        (m.sender_id = auth.uid()) AS is_own_message
    FROM public.messages m
    JOIN public.profiles p ON m.sender_id = p.user_id
    WHERE m.circle_id = p_circle_id
    ORDER BY m.created_at ASC;
END;
$$;

-- Replace get_chat_details with get_circle_details
CREATE OR REPLACE FUNCTION get_circle_details(p_circle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    circle_details jsonb;
BEGIN
    -- Security check: Ensure the current user is a member
    IF NOT EXISTS (
        SELECT 1
        FROM public.circle_members cm
        WHERE cm.circle_id = p_circle_id AND cm.user_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('error', 'User is not a member of this circle');
    END IF;

    -- If user is a member, build the circle details object
    SELECT jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'visibility', c.visibility,
        'sprint_minutes', c.sprint_minutes,
        'ttl_minutes', c.ttl_minutes,
        'owner', c.owner,
        'members', (
            SELECT jsonb_agg(jsonb_build_object(
                'user_id', p.user_id, 
                'username', p.username,
                'role', cm.role
            ))
            FROM public.circle_members cm
            JOIN public.profiles p ON cm.user_id = p.user_id
            WHERE cm.circle_id = p_circle_id
        )
    )
    INTO circle_details
    FROM public.circles c
    WHERE c.id = p_circle_id;

    RETURN circle_details;
END;
$$;

-- Function to get user's circles
CREATE OR REPLACE FUNCTION get_user_circles()
RETURNS TABLE (
    id uuid,
    name text,
    visibility text,
    sprint_minutes int,
    ttl_minutes int,
    role text,
    member_count bigint,
    last_message_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.visibility,
        c.sprint_minutes,
        c.ttl_minutes,
        cm.role,
        (SELECT count(*) FROM circle_members cm2 WHERE cm2.circle_id = c.id) as member_count,
        (SELECT max(m.created_at) FROM messages m WHERE m.circle_id = c.id) as last_message_at
    FROM public.circles c
    JOIN public.circle_members cm ON c.id = cm.circle_id
    WHERE cm.user_id = auth.uid()
    ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC;
END;
$$; 