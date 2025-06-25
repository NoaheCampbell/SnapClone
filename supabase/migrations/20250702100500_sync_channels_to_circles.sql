BEGIN;

-- Sync group channels into circles automatically so old code continues to work

-- 1. Ensure a circle row exists for a given channel (for group channels only)
CREATE OR REPLACE FUNCTION public.ensure_circle_for_channel(p_channel_id uuid, p_owner uuid)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.circles WHERE id = p_channel_id) THEN
    INSERT INTO public.circles (id, name, owner, visibility)
    VALUES (p_channel_id, 'Group', p_owner, 'private')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger to mirror INSERT / DELETE on channel_members into circle_members
CREATE OR REPLACE FUNCTION public.sync_channel_members_to_circles()
RETURNS trigger AS $$
DECLARE
  is_group BOOLEAN;
BEGIN
  -- Only care about channels marked as group chats
  SELECT c.is_group INTO is_group FROM public.channels c WHERE c.id = COALESCE(NEW.channel_id, OLD.channel_id);
  IF NOT is_group THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.ensure_circle_for_channel(NEW.channel_id, NEW.member_id);
    INSERT INTO public.circle_members (circle_id, user_id, role, joined_at)
    VALUES (NEW.channel_id, NEW.member_id, 'member', now())
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.circle_members
    WHERE circle_id = OLD.channel_id
      AND user_id  = OLD.member_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_channel_members ON public.channel_members;
CREATE TRIGGER trg_sync_channel_members
AFTER INSERT OR DELETE ON public.channel_members
FOR EACH ROW EXECUTE FUNCTION public.sync_channel_members_to_circles();

COMMIT; 