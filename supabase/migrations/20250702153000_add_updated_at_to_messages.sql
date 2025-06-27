-- Add updated_at column to messages table so we can timestamp edits
alter table public.messages
    add column if not exists updated_at timestamptz default now();

-- Backfill existing rows
update public.messages
set updated_at = created_at
where updated_at is null; 