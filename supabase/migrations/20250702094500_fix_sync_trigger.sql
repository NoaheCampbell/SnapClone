BEGIN;

-- Update sync trigger so it only mirrors channel_id to circle_id when a matching circle exists
CREATE OR REPLACE FUNCTION public.sync_message_channel_circle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- If only channel_id provided, try map to existing circle
    IF NEW.circle_id IS NULL AND NEW.channel_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.circles c WHERE c.id = NEW.channel_id) THEN
        NEW.circle_id := NEW.channel_id;
      END IF;
    ELSIF NEW.channel_id IS NULL AND NEW.circle_id IS NOT NULL THEN
      NEW.channel_id := NEW.circle_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.channel_id IS DISTINCT FROM OLD.channel_id THEN
      IF EXISTS (SELECT 1 FROM public.circles c WHERE c.id = NEW.channel_id) THEN
        NEW.circle_id := NEW.channel_id;
      END IF;
    ELSIF NEW.circle_id IS DISTINCT FROM OLD.circle_id THEN
      NEW.channel_id := NEW.circle_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- No need to drop trigger; CREATE OR REPLACE above updates body

-- Clean up any rows that were set to an invalid circle_id
UPDATE public.messages m
SET circle_id = NULL
WHERE circle_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.circles c WHERE c.id = m.circle_id);

COMMIT; 