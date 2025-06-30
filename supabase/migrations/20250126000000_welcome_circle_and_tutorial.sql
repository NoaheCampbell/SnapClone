-- Migration: Welcome Circle and Tutorial Setup
-- Creates a default circle that new users automatically join

BEGIN;

-- Create the Welcome Circle
INSERT INTO circles (id, name, owner, visibility, sprint_minutes, allow_member_invites) 
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid, -- Fixed UUID for welcome circle
  'Welcome Circle 👋',
  (SELECT user_id FROM profiles LIMIT 1), -- Will be updated to admin user
  'public',
  25,
  false -- Don't allow members to invite (keep it curated)
) ON CONFLICT (id) DO NOTHING;

-- Function to auto-add new users to Welcome Circle
CREATE OR REPLACE FUNCTION add_user_to_welcome_circle()
RETURNS TRIGGER AS $$
BEGIN
  -- Add new user to welcome circle
  INSERT INTO circle_members (circle_id, user_id, role)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, NEW.user_id, 'member')
  ON CONFLICT DO NOTHING;
  
  -- Create initial streak record for new user
  INSERT INTO streaks (user_id, current_len, best_len, freeze_tokens)
  VALUES (NEW.user_id, 0, 0, 1)
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new profiles
DROP TRIGGER IF EXISTS on_profile_created_add_to_welcome ON profiles;
CREATE TRIGGER on_profile_created_add_to_welcome
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION add_user_to_welcome_circle();

-- Note: Removed the welcome message insertion since we don't have a guaranteed admin user
-- The Welcome Circle itself is sufficient for onboarding new users

COMMIT; 