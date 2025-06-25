BEGIN;

-- Add end_media_url field to sprints table for completion photos
ALTER TABLE public.sprints 
  ADD COLUMN IF NOT EXISTS end_media_url text;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_sprints_media_url ON public.sprints(media_url);
CREATE INDEX IF NOT EXISTS idx_sprints_end_media_url ON public.sprints(end_media_url);

COMMIT; 