-- Complete Consolidated Schema for SnapClone
-- This single migration file creates the entire database structure
-- Based on current production schema as of January 2025

BEGIN;

------------------------------------------------------------
-- 1. Extensions
------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- For gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- For uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pg_cron";      -- For scheduled jobs
CREATE EXTENSION IF NOT EXISTS "vector";       -- For embeddings
CREATE EXTENSION IF NOT EXISTS "pg_net";       -- For HTTP requests

------------------------------------------------------------
-- 2. Drop existing objects (in reverse dependency order)
------------------------------------------------------------
-- Drop existing tables if they exist
DROP TABLE IF EXISTS media_cleanup_queue CASCADE;
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS sprint_participants CASCADE;
DROP TABLE IF EXISTS quiz_attempts CASCADE;
DROP TABLE IF EXISTS quizzes CASCADE;
DROP TABLE IF EXISTS summaries CASCADE;
DROP TABLE IF EXISTS sprints CASCADE;
DROP TABLE IF EXISTS streaks CASCADE;
DROP TABLE IF EXISTS message_reads CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS circle_invites CASCADE;
DROP TABLE IF EXISTS circle_members CASCADE;
DROP TABLE IF EXISTS circles CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS friends CASCADE;
DROP TABLE IF EXISTS friend_requests CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS delete_message_media_on_delete() CASCADE;
DROP FUNCTION IF EXISTS process_media_cleanup_queue_simple() CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_media_queue_entries() CASCADE;
DROP FUNCTION IF EXISTS mark_natural_sprint_completions() CASCADE;
DROP FUNCTION IF EXISTS upsert_sprint_message(uuid, uuid, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS get_users_needing_reminder(text) CASCADE;
DROP FUNCTION IF EXISTS get_circle_messages(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_chat_messages(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_circle_details(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_user_circles() CASCADE;
DROP FUNCTION IF EXISTS create_circle_invite(uuid, timestamptz, integer) CASCADE;

------------------------------------------------------------
-- 3. Core user profiles table
------------------------------------------------------------
CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  bio text,
  is_private boolean DEFAULT false,
  allow_friend_requests boolean DEFAULT true,
  show_last_active boolean DEFAULT true,
  show_stories_to_friends_only boolean DEFAULT false,
  timezone text,
  expo_push_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- 4. Friend system tables
------------------------------------------------------------
CREATE TABLE friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  to_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_id, to_id)
);

CREATE TABLE friends (
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id)
);

------------------------------------------------------------
-- 5. Circles (study groups)
------------------------------------------------------------
CREATE TABLE circles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  sprint_minutes integer NOT NULL DEFAULT 25,
  ttl_minutes integer NOT NULL DEFAULT 30,
  visibility text NOT NULL CHECK (visibility IN ('public','private')),
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  allow_member_invites boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE circle_members (
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  mute_notifications boolean DEFAULT false,
  PRIMARY KEY (circle_id, user_id)
);

CREATE TABLE circle_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE,
  expires_at timestamptz,
  max_uses integer,
  uses_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

------------------------------------------------------------
-- 6. Messages with threading support
------------------------------------------------------------
CREATE TABLE messages (
  id bigserial PRIMARY KEY,
  circle_id uuid REFERENCES circles(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  content text,
  media_url text,
  sprint_id uuid, -- References sprints table (created below)
  thread_root_id bigint REFERENCES messages(id) ON DELETE CASCADE,
  join_count integer NOT NULL DEFAULT 1,
  deleted boolean DEFAULT false,
  expires_at timestamptz DEFAULT (now() + interval '1 day'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE message_reads (
  message_id bigint NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reader_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, reader_id)
);

CREATE TABLE message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id bigint NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('👍','🔥','📚')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id)
);

------------------------------------------------------------
-- 7. Study Sprint tables
------------------------------------------------------------
CREATE TABLE sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid REFERENCES circles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(user_id) ON DELETE CASCADE,
  topic text NOT NULL,
  goals text,
  media_url text,
  end_media_url text,
  quiz_question_count integer DEFAULT 3,
  tags text[],
  ai_summary_id uuid UNIQUE,
  stopped_early boolean NOT NULL DEFAULT false,
  counts_for_streak boolean NOT NULL DEFAULT false,
  joined_from uuid REFERENCES sprints(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sprint_participants (
  sprint_id uuid NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (sprint_id, user_id)
);

CREATE TABLE summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id uuid UNIQUE REFERENCES sprints(id) ON DELETE CASCADE,
  bullets text[],
  tags text[],
  concept_map_url text,
  concept_map_data text,
  embedding vector(1536), -- For semantic search
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id uuid UNIQUE REFERENCES summaries(id) ON DELETE CASCADE,
  mcq_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(user_id) ON DELETE CASCADE,
  score smallint NOT NULL,
  answers jsonb,
  improvement_suggestions text[],
  missed_concepts text[],
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE streaks (
  user_id uuid PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  current_len integer NOT NULL DEFAULT 0,
  best_len integer NOT NULL DEFAULT 0,
  freeze_tokens integer NOT NULL DEFAULT 1,
  token_regen_at timestamptz,
  last_completed_local_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- 8. Notifications
------------------------------------------------------------
CREATE TABLE notifications (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb,
  is_read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- 9. Media cleanup queue
------------------------------------------------------------
CREATE TABLE media_cleanup_queue (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bucket, path)
);

------------------------------------------------------------
-- 10. Add foreign key for sprint_id in messages
------------------------------------------------------------
ALTER TABLE messages 
  ADD CONSTRAINT messages_sprint_id_fkey 
  FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE SET NULL;

------------------------------------------------------------
-- 11. Create indexes for performance
------------------------------------------------------------
-- Messages indexes
CREATE INDEX idx_messages_circle_id ON messages(circle_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_sprint_id ON messages(sprint_id);
CREATE INDEX idx_messages_thread_root_id ON messages(thread_root_id);
CREATE INDEX idx_messages_expires_at ON messages(expires_at) WHERE expires_at IS NOT NULL;

-- Sprint indexes
CREATE INDEX idx_sprints_circle ON sprints(circle_id);
CREATE INDEX idx_sprints_user ON sprints(user_id);
CREATE INDEX idx_sprint_participants_user ON sprint_participants(user_id);

-- Circle indexes
CREATE INDEX idx_circle_members_user ON circle_members(user_id);

-- Quiz indexes
CREATE INDEX idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);
CREATE INDEX idx_quiz_attempts_user ON quiz_attempts(user_id);

-- Friend indexes
CREATE INDEX idx_friends_user_id ON friends(user_id);
CREATE INDEX idx_friends_friend_id ON friends(friend_id);

-- Reaction indexes
CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);

------------------------------------------------------------
-- 12. Functions
------------------------------------------------------------

-- Function to handle media cleanup when messages are deleted
CREATE OR REPLACE FUNCTION delete_message_media_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  media_bucket text;
  media_path text;
BEGIN
  -- Only process if the deleted message had media
  IF OLD.media_url IS NULL OR OLD.media_url = '' THEN
    RETURN OLD;
  END IF;
  
  -- Default to chat-media bucket
  media_bucket := 'chat-media';
  
  -- Extract the path from the URL
  IF OLD.media_url ~ '/storage/v1/object/public/([^/]+)/(.+)$' THEN
    SELECT 
      (regexp_matches(OLD.media_url, '/storage/v1/object/public/([^/]+)/(.+)$'))[1],
      (regexp_matches(OLD.media_url, '/storage/v1/object/public/([^/]+)/(.+)$'))[2]
    INTO media_bucket, media_path;
  ELSE
    media_path := substring(OLD.media_url from '[^/]*$');
  END IF;
  
  -- Skip if we couldn't extract a valid path
  IF media_path IS NULL OR media_path = '' THEN
    RETURN OLD;
  END IF;
  
  -- Queue for deletion
  INSERT INTO media_cleanup_queue (bucket, path, created_at)
  VALUES (media_bucket, media_path, now())
  ON CONFLICT (bucket, path) DO NOTHING;
  
  RETURN OLD;
END;
$$;

-- Function to process media cleanup queue
CREATE OR REPLACE FUNCTION process_media_cleanup_queue_simple()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cleanup_item RECORD;
BEGIN
  FOR cleanup_item IN 
    SELECT id, bucket, path FROM media_cleanup_queue
    ORDER BY created_at ASC
  LOOP
    BEGIN
      -- Delete the file from storage
      PERFORM storage.delete_object(cleanup_item.bucket, cleanup_item.path);
      
      -- Remove from queue
      DELETE FROM media_cleanup_queue WHERE id = cleanup_item.id;
    EXCEPTION WHEN OTHERS THEN
      -- Leave in queue for retry
      NULL;
    END;
  END LOOP;
END;
$$;

-- Function to clean up old queue entries
CREATE OR REPLACE FUNCTION cleanup_old_media_queue_entries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM media_cleanup_queue
  WHERE created_at < now() - interval '7 days';
END;
$$;

-- Function to upsert sprint messages (for threading)
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

-- Function to mark naturally completed sprints for streaks
CREATE OR REPLACE FUNCTION mark_natural_sprint_completions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sprints 
  SET counts_for_streak = true
  WHERE ends_at <= now()
    AND NOT stopped_early
    AND NOT counts_for_streak
    AND EXTRACT(EPOCH FROM (ends_at - started_at)) >= 600; -- At least 10 minutes
END;
$$;

-- Function to get users needing streak reminder
CREATE OR REPLACE FUNCTION get_users_needing_reminder(now_iso text)
RETURNS SETOF profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamp := now_iso::timestamptz;
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM profiles p
  JOIN streaks s ON s.user_id = p.user_id
  WHERE s.current_len >= 3
    AND p.expo_push_token IS NOT NULL
    AND (
      date_trunc('minute', (v_now AT TIME ZONE COALESCE(p.timezone,'UTC')))
        BETWEEN date_trunc('minute', (v_now AT TIME ZONE COALESCE(p.timezone,'UTC'))::date + interval '18 hours')
            AND date_trunc('minute', (v_now AT TIME ZONE COALESCE(p.timezone,'UTC'))::date + interval '18 hours 5 minutes')
    )
    AND NOT EXISTS (
      SELECT 1 FROM sprints sp
      WHERE sp.user_id = p.user_id
        AND sp.counts_for_streak = true
        AND sp.ends_at >= (v_now AT TIME ZONE COALESCE(p.timezone,'UTC'))::date
    );
END;
$$;

-- RPC function to get circle messages
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

-- Removed legacy get_chat_messages function - all chats are now circles

-- Function to get user's circles with last message info
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

-- Function to create circle invite
CREATE OR REPLACE FUNCTION create_circle_invite(
    p_circle_id uuid,
    p_expires_at timestamptz DEFAULT NULL,
    p_max_uses integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invite_code text;
    v_invite_id uuid;
BEGIN
    -- Check if user is owner or has permission
    IF NOT EXISTS (
        SELECT 1 FROM circle_members cm
        JOIN circles c ON c.id = cm.circle_id
        WHERE cm.circle_id = p_circle_id 
        AND cm.user_id = auth.uid()
        AND (c.owner = auth.uid() OR c.allow_member_invites = true)
    ) THEN
        RAISE EXCEPTION 'Unauthorized to create invites for this circle';
    END IF;

    -- Generate unique invite code
    v_invite_code := encode(gen_random_bytes(6), 'hex');
    
    -- Create invite
    INSERT INTO circle_invites (circle_id, created_by, invite_code, expires_at, max_uses)
    VALUES (p_circle_id, auth.uid(), v_invite_code, p_expires_at, p_max_uses)
    RETURNING id INTO v_invite_id;

    RETURN jsonb_build_object(
        'invite_id', v_invite_id,
        'invite_code', v_invite_code,
        'expires_at', p_expires_at,
        'max_uses', p_max_uses
    );
END;
$$;

-- Function to get circle details
CREATE OR REPLACE FUNCTION get_circle_details(p_circle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_circle_data jsonb;
BEGIN
    -- Check if user is a member
    IF NOT EXISTS (
        SELECT 1 FROM circle_members cm
        WHERE cm.circle_id = p_circle_id AND cm.user_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('error', 'Access denied');
    END IF;

    -- Get circle details with members
    SELECT jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'visibility', c.visibility,
        'sprint_minutes', c.sprint_minutes,
        'ttl_minutes', c.ttl_minutes,
        'owner', c.owner,
        'allow_member_invites', c.allow_member_invites,
        'members', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'user_id', cm.user_id,
                    'username', p.username,
                    'role', cm.role
                ) ORDER BY cm.joined_at
            ) FILTER (WHERE cm.user_id IS NOT NULL),
            '[]'::jsonb
        )
    ) INTO v_circle_data
    FROM circles c
    LEFT JOIN circle_members cm ON cm.circle_id = c.id
    LEFT JOIN profiles p ON p.user_id = cm.user_id
    WHERE c.id = p_circle_id
    GROUP BY c.id;

    RETURN v_circle_data;
END;
$$;

-- Function to get circle invites
CREATE OR REPLACE FUNCTION get_circle_invites(p_circle_id uuid)
RETURNS TABLE (
    id uuid,
    invite_code text,
    created_by_username text,
    expires_at timestamptz,
    max_uses integer,
    uses_count integer,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if user is owner or has permission
    IF NOT EXISTS (
        SELECT 1 FROM circle_members cm
        JOIN circles c ON c.id = cm.circle_id
        WHERE cm.circle_id = p_circle_id 
        AND cm.user_id = auth.uid()
        AND (c.owner = auth.uid() OR cm.role = 'admin')
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        ci.id,
        ci.invite_code,
        p.username as created_by_username,
        ci.expires_at,
        ci.max_uses,
        ci.uses_count,
        ci.created_at
    FROM circle_invites ci
    JOIN profiles p ON p.user_id = ci.created_by
    WHERE ci.circle_id = p_circle_id
      AND ci.is_active = true
    ORDER BY ci.created_at DESC;
END;
$$;

-- Function to revoke circle invite
CREATE OR REPLACE FUNCTION revoke_circle_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_circle_id uuid;
BEGIN
    -- Get circle_id from invite
    SELECT circle_id INTO v_circle_id
    FROM circle_invites
    WHERE id = p_invite_id;

    -- Check if user has permission
    IF NOT EXISTS (
        SELECT 1 FROM circle_members cm
        JOIN circles c ON c.id = cm.circle_id
        WHERE cm.circle_id = v_circle_id 
        AND cm.user_id = auth.uid()
        AND (c.owner = auth.uid() OR cm.role = 'admin')
    ) THEN
        RETURN jsonb_build_object('error', 'Unauthorized');
    END IF;

    -- Revoke invite
    UPDATE circle_invites
    SET is_active = false
    WHERE id = p_invite_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to join circle by invite
CREATE OR REPLACE FUNCTION join_circle_by_invite(p_invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invite record;
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    -- Find valid invite
    SELECT * INTO v_invite
    FROM circle_invites
    WHERE invite_code = p_invite_code
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND (max_uses IS NULL OR uses_count < max_uses);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Invalid or expired invite code');
    END IF;

    -- Check if already a member
    IF EXISTS (
        SELECT 1 FROM circle_members
        WHERE circle_id = v_invite.circle_id AND user_id = v_user_id
    ) THEN
        RETURN jsonb_build_object('error', 'Already a member of this circle');
    END IF;

    -- Add user to circle
    INSERT INTO circle_members (circle_id, user_id, role)
    VALUES (v_invite.circle_id, v_user_id, 'member')
    ON CONFLICT DO NOTHING;

    -- Increment uses count
    UPDATE circle_invites
    SET uses_count = uses_count + 1
    WHERE id = v_invite.id;

    RETURN jsonb_build_object(
        'success', true,
        'circle_id', v_invite.circle_id
    );
END;
$$;

-- Removed legacy get_chat_details function - all chats are now circles

------------------------------------------------------------
-- 13. Triggers
------------------------------------------------------------

-- Trigger for media cleanup
CREATE TRIGGER trigger_delete_message_media
  AFTER DELETE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION delete_message_media_on_delete();

------------------------------------------------------------
-- 14. Permissions
------------------------------------------------------------

-- Grant permissions for service role
GRANT ALL ON media_cleanup_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE media_cleanup_queue_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION process_media_cleanup_queue_simple() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_media_queue_entries() TO service_role;
GRANT EXECUTE ON FUNCTION mark_natural_sprint_completions() TO service_role;
GRANT EXECUTE ON FUNCTION get_users_needing_reminder(text) TO service_role;
GRANT EXECUTE ON FUNCTION get_circle_messages(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_user_circles() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_circle_invite(uuid, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_sprint_message(uuid, uuid, uuid, text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_circle_details(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_circle_invites(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_circle_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION join_circle_by_invite(text) TO authenticated;

------------------------------------------------------------
-- 15. Cron Jobs
------------------------------------------------------------

-- Delete expired messages and process media cleanup every minute
SELECT cron.schedule(
  'purge-expired-messages-and-media',
  '*/1 * * * *',
  $$
    DELETE FROM messages WHERE expires_at < now();
    SELECT process_media_cleanup_queue_simple();
  $$
);

-- Clean up old media queue entries daily
SELECT cron.schedule(
  'cleanup-old-media-queue',
  '0 3 * * *',
  'SELECT cleanup_old_media_queue_entries();'
);

-- Mark naturally completed sprints for streaks every 5 minutes
SELECT cron.schedule(
  'mark-natural-sprint-completions',
  '*/5 * * * *',
  'SELECT mark_natural_sprint_completions();'
);

-- Update streaks daily at 02:05 UTC
SELECT cron.schedule(
  'update-streaks-daily',
  '5 2 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/updateStreaksDaily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Send streak reminders at 18:00 UTC
SELECT cron.schedule(
  'send-streak-reminders',
  '0 18 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/sendStreakReminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := jsonb_build_object('now_iso', now()::text)
  );
  $$
);

------------------------------------------------------------
-- 16. Enable Realtime
------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;

------------------------------------------------------------
-- 17. Row Level Security (RLS)
------------------------------------------------------------
-- RLS is disabled per PRD requirements for simplicity

COMMIT; 