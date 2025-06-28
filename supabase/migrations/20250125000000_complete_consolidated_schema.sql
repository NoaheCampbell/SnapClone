-- Complete Consolidated Schema for SnapClone
-- This single migration file creates the entire database structure
-- Based on current production schema as of January 2025
--
-- IMPORTANT: After running this migration, you need to:
-- 1. Update the vault secrets with your actual values:
--    - Run: SELECT vault.update_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
--    - Run: SELECT vault.update_secret('YOUR-SERVICE-ROLE-KEY', 'service_role_key');
-- 2. Verify the setup with: SELECT * FROM check_vault_secrets();
--
-- For local development: Use http://localhost:54321 as the project_url

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
DROP TABLE IF EXISTS circle_invitations CASCADE;  -- New direct invitations table
DROP TABLE IF EXISTS circle_invites CASCADE;       -- Old invite code table
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
DROP FUNCTION IF EXISTS check_vault_secrets() CASCADE;
DROP FUNCTION IF EXISTS notify_circle_message_push() CASCADE;
DROP FUNCTION IF EXISTS send_circle_invitation(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS respond_to_circle_invitation(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS get_pending_circle_invitations() CASCADE;
DROP FUNCTION IF EXISTS get_invitable_friends(uuid) CASCADE;
DROP FUNCTION IF EXISTS join_circle_by_invite(text) CASCADE;
DROP FUNCTION IF EXISTS get_circle_invites(uuid) CASCADE;
DROP FUNCTION IF EXISTS revoke_circle_invite(uuid) CASCADE;

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

CREATE TABLE circle_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(circle_id, to_user_id) -- Can only have one invite per user per circle
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

-- Circle invitations indexes
CREATE INDEX idx_circle_invitations_to_user ON circle_invitations(to_user_id);
CREATE INDEX idx_circle_invitations_from_user ON circle_invitations(from_user_id);
CREATE INDEX idx_circle_invitations_circle ON circle_invitations(circle_id);
CREATE INDEX idx_circle_invitations_status ON circle_invitations(status);

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
DROP FUNCTION IF EXISTS get_user_circles();
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
    ORDER BY lm.last_message_at DESC NULLS LAST;
END;
$$;

-- Function to send circle invitation
CREATE OR REPLACE FUNCTION send_circle_invitation(
  p_circle_id uuid,
  p_to_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_circle_name text;
  v_from_user_id uuid;
  v_invitation_id uuid;
  v_is_public boolean;
BEGIN
  v_from_user_id := auth.uid();
  
  -- Check if sender is a member of the circle
  IF NOT EXISTS (
    SELECT 1 FROM circle_members cm
    WHERE cm.circle_id = p_circle_id AND cm.user_id = v_from_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'You are not a member of this circle');
  END IF;

  -- Get circle details
  SELECT name, (visibility = 'public') INTO v_circle_name, v_is_public
  FROM circles WHERE id = p_circle_id;

  -- Check if circle is public
  IF v_is_public THEN
    RETURN jsonb_build_object('error', 'Public circles do not require invitations');
  END IF;

  -- Check if the recipient is already a member
  IF EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = p_to_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'User is already a member of this circle');
  END IF;

  -- Check if users are friends
  IF NOT EXISTS (
    SELECT 1 FROM friends
    WHERE (user_id = v_from_user_id AND friend_id = p_to_user_id)
       OR (user_id = p_to_user_id AND friend_id = v_from_user_id)
  ) THEN
    RETURN jsonb_build_object('error', 'You can only invite friends to private circles');
  END IF;

  -- Check if there's already a pending invitation
  IF EXISTS (
    SELECT 1 FROM circle_invitations
    WHERE circle_id = p_circle_id 
      AND to_user_id = p_to_user_id 
      AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('error', 'Invitation already sent to this user');
  END IF;

  -- Delete any old declined/accepted invitations to allow re-inviting
  DELETE FROM circle_invitations
  WHERE circle_id = p_circle_id 
    AND to_user_id = p_to_user_id 
    AND status IN ('accepted', 'declined');

  -- Create the invitation
  INSERT INTO circle_invitations (circle_id, from_user_id, to_user_id)
  VALUES (p_circle_id, v_from_user_id, p_to_user_id)
  RETURNING id INTO v_invitation_id;

  -- Create notification for the recipient
  INSERT INTO notifications (user_id, type, payload)
  VALUES (
    p_to_user_id,
    'circle_invitation',
    jsonb_build_object(
      'invitation_id', v_invitation_id,
      'circle_id', p_circle_id,
      'circle_name', v_circle_name,
      'from_user_id', v_from_user_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'invitation_id', v_invitation_id,
    'circle_name', v_circle_name
  );
END;
$$;

-- Function to respond to circle invitation
CREATE OR REPLACE FUNCTION respond_to_circle_invitation(
  p_invitation_id uuid,
  p_response text -- 'accepted' or 'declined'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation record;
  v_user_id uuid;
  v_circle_name text;
BEGIN
  v_user_id := auth.uid();
  
  -- Get invitation details
  SELECT * INTO v_invitation
  FROM circle_invitations
  WHERE id = p_invitation_id
    AND to_user_id = v_user_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or already processed invitation');
  END IF;

  -- If accepted, add user to circle
  IF p_response = 'accepted' THEN
    INSERT INTO circle_members (circle_id, user_id, role)
    VALUES (v_invitation.circle_id, v_user_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Get circle name for return message
  SELECT name INTO v_circle_name FROM circles WHERE id = v_invitation.circle_id;

  -- Delete the invitation to allow future re-invites
  DELETE FROM circle_invitations WHERE id = p_invitation_id;

  -- Return appropriate response
  IF p_response = 'accepted' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Successfully joined the circle',
      'circle_id', v_invitation.circle_id,
      'circle_name', v_circle_name
    );
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Invitation declined'
    );
  END IF;
END;
$$;

-- Function to get pending circle invitations for a user
CREATE OR REPLACE FUNCTION get_pending_circle_invitations()
RETURNS TABLE (
  id uuid,
  circle_id uuid,
  circle_name text,
  from_user_id uuid,
  from_username text,
  from_avatar_url text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ci.id,
    ci.circle_id,
    c.name as circle_name,
    ci.from_user_id,
    p.username as from_username,
    p.avatar_url as from_avatar_url,
    ci.created_at
  FROM circle_invitations ci
  JOIN circles c ON c.id = ci.circle_id
  JOIN profiles p ON p.user_id = ci.from_user_id
  WHERE ci.to_user_id = auth.uid()
    AND ci.status = 'pending'
  ORDER BY ci.created_at DESC;
END;
$$;

-- Function to get friends available to invite to a circle
CREATE OR REPLACE FUNCTION get_invitable_friends(p_circle_id uuid)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  has_pending_invite boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is a member of the circle
  IF NOT EXISTS (
    SELECT 1 FROM circle_members cm
    WHERE cm.circle_id = p_circle_id AND cm.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    p.user_id,
    p.username,
    p.avatar_url,
    EXISTS(
      SELECT 1 FROM circle_invitations ci
      WHERE ci.circle_id = p_circle_id 
        AND ci.to_user_id = p.user_id 
        AND ci.status = 'pending'
    ) as has_pending_invite
  FROM friends f
  JOIN profiles p ON p.user_id = f.friend_id
  WHERE f.user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = p_circle_id AND cm.user_id = f.friend_id
    )
  ORDER BY p.username;
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

-- Removed legacy get_chat_details function - all chats are now circles

-- Function to check vault secrets configuration
CREATE OR REPLACE FUNCTION check_vault_secrets()
RETURNS TABLE (
  secret_name text,
  is_configured boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.name::text,
    (s.decrypted_secret != 'https://YOUR-PROJECT-REF.supabase.co' 
     AND s.decrypted_secret != 'YOUR-SERVICE-ROLE-KEY')::boolean
  FROM vault.decrypted_secrets s
  WHERE s.name IN ('project_url', 'service_role_key');
END;
$$;

-- Function to send push notifications for circle messages
CREATE OR REPLACE FUNCTION notify_circle_message_push()
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

------------------------------------------------------------
-- 13. Triggers
------------------------------------------------------------

-- Trigger for media cleanup
CREATE TRIGGER trigger_delete_message_media
  AFTER DELETE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION delete_message_media_on_delete();

-- Trigger for push notifications
CREATE TRIGGER message_notifications
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_circle_message_push();

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
GRANT EXECUTE ON FUNCTION upsert_sprint_message(uuid, uuid, uuid, text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_circle_details(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION check_vault_secrets() TO authenticated;
GRANT EXECUTE ON FUNCTION send_circle_invitation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION respond_to_circle_invitation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_circle_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION get_invitable_friends(uuid) TO authenticated;

------------------------------------------------------------
-- 15. Vault Setup (for secure storage of project secrets)
------------------------------------------------------------

-- Store project configuration in vault
-- IMPORTANT: Update these values with your actual project details!
-- For local development, use: http://localhost:54321
-- For production, use: https://YOUR-PROJECT-REF.supabase.co
SELECT vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url', 'Supabase project URL');
SELECT vault.create_secret('YOUR-SERVICE-ROLE-KEY', 'service_role_key', 'Supabase service role key');

------------------------------------------------------------
-- 16. Cron Jobs
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
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/updateStreaksDaily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
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
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/sendStreakReminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('now_iso', now()::text)
  );
  $$
);

------------------------------------------------------------
-- 17. Enable Realtime
------------------------------------------------------------
-- Enable realtime for all main tables to simplify development
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE friends;
ALTER PUBLICATION supabase_realtime ADD TABLE friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE circles;
ALTER PUBLICATION supabase_realtime ADD TABLE circle_members;
ALTER PUBLICATION supabase_realtime ADD TABLE circle_invitations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE message_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE sprints;
ALTER PUBLICATION supabase_realtime ADD TABLE sprint_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE summaries;
ALTER PUBLICATION supabase_realtime ADD TABLE quizzes;
ALTER PUBLICATION supabase_realtime ADD TABLE quiz_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE streaks;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

------------------------------------------------------------
-- 18. Row Level Security (RLS)
------------------------------------------------------------
-- RLS is disabled per PRD requirements for simplicity

-- Clean up any existing accepted/declined invitations  
-- (This allows re-inviting users who previously left circles)
DELETE FROM circle_invitations WHERE status IN ('accepted', 'declined');

COMMIT; 