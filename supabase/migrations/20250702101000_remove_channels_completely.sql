BEGIN;

-- Remove the sync trigger since we're going direct to circles
DROP TRIGGER IF EXISTS trg_sync_channel_members ON public.channel_members;
DROP FUNCTION IF EXISTS public.sync_channel_members_to_circles();
DROP FUNCTION IF EXISTS public.ensure_circle_for_channel(uuid, uuid);

-- Drop the channels tables since we're using circles directly now
DROP TABLE IF EXISTS public.channel_members CASCADE;
DROP TABLE IF EXISTS public.channels CASCADE;

COMMIT; 