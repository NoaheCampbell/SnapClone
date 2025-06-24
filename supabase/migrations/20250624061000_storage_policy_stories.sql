-- Migration: allow authenticated users to upload files to stories bucket

create policy if not exists "Stories bucket uploads" on storage.objects
  for insert with check (
    bucket_id = 'stories' and auth.role() = 'authenticated'
  ); 