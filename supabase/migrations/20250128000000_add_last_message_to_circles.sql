-- Drop the existing function first
DROP FUNCTION IF EXISTS get_user_circles();

-- Update get_user_circles to include last message content and sender info
CREATE OR REPLACE FUNCTION get_user_circles()
RETURNS TABLE (
    id uuid,
    name text,
    owner uuid,
    visibility text,
    sprint_minutes integer,
    ttl_minutes integer,
    role text,
    member_count bigint,
    last_message_at timestamptz,
    last_message_content text,
    last_message_sender text,
    last_message_media boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH circle_basics AS (
        SELECT 
            c.id,
            c.name,
            c.owner,
            c.visibility,
            c.sprint_minutes,
            c.ttl_minutes,
            cm.role,
            COUNT(cm2.user_id) AS member_count
        FROM circles c
        JOIN circle_members cm ON cm.circle_id = c.id AND cm.user_id = auth.uid()
        LEFT JOIN circle_members cm2 ON cm2.circle_id = c.id
        GROUP BY c.id, c.name, c.owner, c.visibility, c.sprint_minutes, c.ttl_minutes, cm.role
    ),
    last_messages AS (
        SELECT DISTINCT ON (m.circle_id)
            m.circle_id,
            m.created_at AS last_message_at,
            m.content AS last_message_content,
            p.username AS last_message_sender,
            (m.media_url IS NOT NULL) AS last_message_media
        FROM messages m
        JOIN profiles p ON p.user_id = m.sender_id
        WHERE m.circle_id IN (SELECT id FROM circle_basics)
          AND (m.thread_root_id IS NULL OR m.thread_root_id = m.id) -- Only root messages
        ORDER BY m.circle_id, m.created_at DESC
    )
    SELECT 
        cb.id,
        cb.name,
        cb.owner,
        cb.visibility,
        cb.sprint_minutes,
        cb.ttl_minutes,
        cb.role,
        cb.member_count,
        lm.last_message_at,
        lm.last_message_content,
        lm.last_message_sender,
        lm.last_message_media
    FROM circle_basics cb
    LEFT JOIN last_messages lm ON lm.circle_id = cb.id
    ORDER BY COALESCE(lm.last_message_at, cb.id::timestamptz) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_circles() TO authenticated, anon; 