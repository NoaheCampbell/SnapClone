-- Migration: Add direct circle invitations system
-- This replaces the invite code system with direct invites similar to friend requests

BEGIN;

-- Create circle_invitations table for direct invites
CREATE TABLE IF NOT EXISTS circle_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(circle_id, to_user_id) -- Can only have one invite per user per circle
);

-- Add indexes for performance
CREATE INDEX idx_circle_invitations_to_user ON circle_invitations(to_user_id);
CREATE INDEX idx_circle_invitations_from_user ON circle_invitations(from_user_id);
CREATE INDEX idx_circle_invitations_circle ON circle_invitations(circle_id);
CREATE INDEX idx_circle_invitations_status ON circle_invitations(status);

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

  -- Update invitation status
  UPDATE circle_invitations
  SET status = p_response,
      responded_at = now()
  WHERE id = p_invitation_id;

  -- If accepted, add user to circle
  IF p_response = 'accepted' THEN
    INSERT INTO circle_members (circle_id, user_id, role)
    VALUES (v_invitation.circle_id, v_user_id, 'member')
    ON CONFLICT DO NOTHING;

    -- Get circle name for return message
    DECLARE v_circle_name text;
    BEGIN
      SELECT name INTO v_circle_name FROM circles WHERE id = v_invitation.circle_id;
      
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Successfully joined the circle',
        'circle_id', v_invitation.circle_id,
        'circle_name', v_circle_name
      );
    END;
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION send_circle_invitation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION respond_to_circle_invitation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_circle_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION get_invitable_friends(uuid) TO authenticated;

-- Enable realtime for circle_invitations
ALTER PUBLICATION supabase_realtime ADD TABLE circle_invitations;

COMMIT; 