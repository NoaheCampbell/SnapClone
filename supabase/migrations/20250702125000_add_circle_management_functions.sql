BEGIN;

-- Function to get public circles for discovery
CREATE OR REPLACE FUNCTION get_public_circles(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE (
    id uuid,
    name text,
    owner_username text,
    member_count bigint,
    sprint_minutes int,
    ttl_minutes int,
    created_at timestamptz,
    is_member boolean
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
        p.username as owner_username,
        (SELECT count(*) FROM circle_members cm WHERE cm.circle_id = c.id) as member_count,
        c.sprint_minutes,
        c.ttl_minutes,
        c.created_at,
        EXISTS (
            SELECT 1 FROM circle_members cm2 
            WHERE cm2.circle_id = c.id AND cm2.user_id = auth.uid()
        ) as is_member
    FROM public.circles c
    JOIN public.profiles p ON c.owner = p.user_id
    WHERE c.visibility = 'public'
    ORDER BY member_count DESC, c.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Function to join a public circle
CREATE OR REPLACE FUNCTION join_public_circle(p_circle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    circle_info record;
    current_user_id uuid;
BEGIN
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'User not authenticated');
    END IF;
    
    -- Check if circle exists and is public
    SELECT c.id, c.name, c.visibility INTO circle_info
    FROM public.circles c
    WHERE c.id = p_circle_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Circle not found');
    END IF;
    
    IF circle_info.visibility != 'public' THEN
        RETURN jsonb_build_object('error', 'Circle is not public');
    END IF;
    
    -- Check if user is already a member
    IF EXISTS (
        SELECT 1 FROM public.circle_members cm 
        WHERE cm.circle_id = p_circle_id AND cm.user_id = current_user_id
    ) THEN
        RETURN jsonb_build_object('error', 'Already a member of this circle');
    END IF;
    
    -- Add user to circle
    INSERT INTO public.circle_members (circle_id, user_id, role)
    VALUES (p_circle_id, current_user_id, 'member');
    
    -- Send system message about joining
    INSERT INTO public.messages (circle_id, sender_id, content)
    SELECT p_circle_id, current_user_id, p.username || ' joined the circle'
    FROM public.profiles p
    WHERE p.user_id = current_user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Successfully joined circle',
        'circle_name', circle_info.name
    );
END;
$$;

-- Function to generate and manage invite codes for circles
CREATE TABLE IF NOT EXISTS circle_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    circle_id uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    invite_code text UNIQUE NOT NULL,
    expires_at timestamptz,
    max_uses integer,
    uses_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circle_invites_code ON circle_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_circle_invites_circle ON circle_invites(circle_id);

-- Function to create an invite code
CREATE OR REPLACE FUNCTION create_circle_invite(
    p_circle_id uuid,
    p_expires_hours integer DEFAULT 168, -- 7 days default
    p_max_uses integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    user_role text;
    invite_code text;
    expires_at timestamptz;
BEGIN
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'User not authenticated');
    END IF;
    
    -- Check if user is owner or admin of the circle
    SELECT cm.role INTO user_role
    FROM public.circle_members cm
    WHERE cm.circle_id = p_circle_id AND cm.user_id = current_user_id;
    
    IF user_role IS NULL THEN
        RETURN jsonb_build_object('error', 'User is not a member of this circle');
    END IF;
    
    IF user_role NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object('error', 'Only owners and admins can create invite codes');
    END IF;
    
    -- Generate a unique invite code
    invite_code := upper(substring(gen_random_uuid()::text from 1 for 8));
    expires_at := now() + (p_expires_hours || ' hours')::interval;
    
    -- Insert the invite
    INSERT INTO public.circle_invites (circle_id, created_by, invite_code, expires_at, max_uses)
    VALUES (p_circle_id, current_user_id, invite_code, expires_at, p_max_uses);
    
    RETURN jsonb_build_object(
        'success', true,
        'invite_code', invite_code,
        'expires_at', expires_at,
        'max_uses', p_max_uses
    );
END;
$$;

-- Function to join circle via invite code
CREATE OR REPLACE FUNCTION join_circle_by_invite(p_invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    invite_info record;
    circle_info record;
    current_user_id uuid;
BEGIN
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'User not authenticated');
    END IF;
    
    -- Get invite details
    SELECT ci.*, c.name as circle_name
    INTO invite_info
    FROM public.circle_invites ci
    JOIN public.circles c ON ci.circle_id = c.id
    WHERE ci.invite_code = upper(p_invite_code);
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Invalid invite code');
    END IF;
    
    -- Check if invite is expired
    IF invite_info.expires_at IS NOT NULL AND invite_info.expires_at < now() THEN
        RETURN jsonb_build_object('error', 'Invite code has expired');
    END IF;
    
    -- Check if invite has reached max uses
    IF invite_info.max_uses IS NOT NULL AND invite_info.uses_count >= invite_info.max_uses THEN
        RETURN jsonb_build_object('error', 'Invite code has reached maximum uses');
    END IF;
    
    -- Check if user is already a member
    IF EXISTS (
        SELECT 1 FROM public.circle_members cm 
        WHERE cm.circle_id = invite_info.circle_id AND cm.user_id = current_user_id
    ) THEN
        RETURN jsonb_build_object('error', 'Already a member of this circle');
    END IF;
    
    -- Add user to circle
    INSERT INTO public.circle_members (circle_id, user_id, role)
    VALUES (invite_info.circle_id, current_user_id, 'member');
    
    -- Increment invite uses
    UPDATE public.circle_invites
    SET uses_count = uses_count + 1
    WHERE id = invite_info.id;
    
    -- Send system message about joining
    INSERT INTO public.messages (circle_id, sender_id, content)
    SELECT invite_info.circle_id, current_user_id, p.username || ' joined the circle'
    FROM public.profiles p
    WHERE p.user_id = current_user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Successfully joined circle',
        'circle_name', invite_info.circle_name,
        'circle_id', invite_info.circle_id
    );
END;
$$;

-- Function to get circle invites (for owners/admins)
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
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    user_role text;
BEGIN
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RETURN;
    END IF;
    
    -- Check if user is owner or admin of the circle
    SELECT cm.role INTO user_role
    FROM public.circle_members cm
    WHERE cm.circle_id = p_circle_id AND cm.user_id = current_user_id;
    
    IF user_role NOT IN ('owner', 'admin') THEN
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
    FROM public.circle_invites ci
    JOIN public.profiles p ON ci.created_by = p.user_id
    WHERE ci.circle_id = p_circle_id
    ORDER BY ci.created_at DESC;
END;
$$;

-- Function to revoke an invite code
CREATE OR REPLACE FUNCTION revoke_circle_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    user_role text;
    invite_circle_id uuid;
BEGIN
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'User not authenticated');
    END IF;
    
    -- Get the circle_id for this invite
    SELECT circle_id INTO invite_circle_id
    FROM public.circle_invites
    WHERE id = p_invite_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Invite not found');
    END IF;
    
    -- Check if user is owner or admin of the circle
    SELECT cm.role INTO user_role
    FROM public.circle_members cm
    WHERE cm.circle_id = invite_circle_id AND cm.user_id = current_user_id;
    
    IF user_role NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object('error', 'Only owners and admins can revoke invite codes');
    END IF;
    
    -- Delete the invite
    DELETE FROM public.circle_invites WHERE id = p_invite_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Invite code revoked');
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_public_circles(integer, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION join_public_circle(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_circle_invite(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION join_circle_by_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_circle_invites(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_circle_invite(uuid) TO authenticated;

COMMIT; 