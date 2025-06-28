-- Migration: Fix circle invitations to delete after processing
-- This allows users to be re-invited if they leave a circle

BEGIN;

-- Update the respond_to_circle_invitation function to delete invitations after processing
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

-- Also update the send_circle_invitation function to delete any old declined invitations
-- before creating a new one
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

-- Optional: Clean up any existing accepted/declined invitations
DELETE FROM circle_invitations WHERE status IN ('accepted', 'declined');

COMMIT; 