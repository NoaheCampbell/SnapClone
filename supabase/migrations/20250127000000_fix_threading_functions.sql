-- Fix threading functions after manual table deletions
BEGIN;

-- Drop old functions if they exist
DROP FUNCTION IF EXISTS upsert_sprint_message(uuid, uuid, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS get_circle_messages(uuid) CASCADE;

-- Recreate upsert_sprint_message function
CREATE OR REPLACE FUNCTION upsert_sprint_message(
    p_circle_id uuid,
    p_user_id uuid,
    p_sprint_id uuid,
    p_content text,
    p_media_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_root_id bigint;
BEGIN
  -- Look for existing root message for this sprint
  SELECT id INTO v_root_id
  FROM messages
  WHERE circle_id = p_circle_id
    AND sprint_id = p_sprint_id
    AND thread_root_id = id
  LIMIT 1;

  IF v_root_id IS NOT NULL THEN
    -- Update join count
    UPDATE messages
    SET join_count = join_count + 1,
        updated_at = now()
    WHERE id = v_root_id;
  ELSE
    -- Create new root message
    INSERT INTO messages (circle_id, sender_id, sprint_id, content, media_url)
    VALUES (p_circle_id, p_user_id, p_sprint_id, p_content, p_media_url)
    RETURNING id INTO v_root_id;

    UPDATE messages
    SET thread_root_id = v_root_id,
        join_count = 1
    WHERE id = v_root_id;
  END IF;
END;
$$;

-- Recreate get_circle_messages function  
CREATE OR REPLACE FUNCTION get_circle_messages(p_circle_id uuid)
RETURNS TABLE (
    id bigint,
    content text,
    media_url text,
    sprint_id uuid,
    thread_root_id bigint,
    join_count integer,
    sender_id uuid,
    created_at timestamptz,
    updated_at timestamptz,
    sender_name text,
    avatar_url text,
    is_own_message boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check membership
    IF NOT EXISTS (
        SELECT 1 FROM circle_members cm
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
        m.thread_root_id,
        m.join_count,
        m.sender_id,
        m.created_at,
        m.updated_at,
        p.username AS sender_name,
        p.avatar_url,
        (m.sender_id = auth.uid()) AS is_own_message
    FROM messages m
    JOIN profiles p ON p.user_id = m.sender_id
    WHERE m.circle_id = p_circle_id
      AND (m.thread_root_id IS NULL OR m.thread_root_id = m.id) -- Only root messages
    ORDER BY m.created_at ASC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION upsert_sprint_message(uuid, uuid, uuid, text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_circle_messages(uuid) TO authenticated, anon;

COMMIT; 