-- Migration: allow authenticated users to upload files to stories bucket

-- Storage policy for stories bucket (bucket already exists)
create policy if not exists "Stories upload policy" on storage.objects
  for insert with check (
    bucket_id = 'stories' and auth.role() = 'authenticated'
  );

-- Enable real-time for channel_members table to handle DELETE events
-- This ensures that when someone leaves a chat, it immediately disappears from their inbox
alter publication supabase_realtime add table channel_members;

-- Also ensure messages table is in the publication for real-time updates
alter publication supabase_realtime add table messages; 