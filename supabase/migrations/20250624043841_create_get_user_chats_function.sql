CREATE OR REPLACE FUNCTION get_user_chats()
RETURNS TABLE(
    id uuid,
    is_group boolean,
    participants jsonb,
    last_message jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH last_messages AS (
        SELECT DISTINCT ON (channel_id)
            channel_id,
            jsonb_build_object(
                'content', content,
                'created_at', created_at,
                'sender_name', p.username
            ) AS message_data
        FROM messages m
        JOIN profiles p ON m.sender_id = p.user_id
        ORDER BY channel_id, m.created_at DESC
    ),
    channel_participants AS (
        SELECT
            cm.channel_id,
            jsonb_agg(jsonb_build_object('user_id', p.user_id, 'username', p.username, 'avatar_url', p.avatar_url)) AS participants_data
        FROM channel_members cm
        JOIN profiles p ON cm.member_id = p.user_id
        WHERE cm.member_id != auth.uid()
        GROUP BY cm.channel_id
    )
    SELECT
        c.id,
        c.is_group,
        cp.participants_data,
        lm.message_data
    FROM channels c
    JOIN channel_members cm_user ON c.id = cm_user.channel_id AND cm_user.member_id = auth.uid()
    LEFT JOIN channel_participants cp ON c.id = cp.channel_id
    LEFT JOIN last_messages lm ON c.id = lm.channel_id
    ORDER BY (lm.message_data->>'created_at')::timestamptz DESC NULLS LAST;
END;
$$;