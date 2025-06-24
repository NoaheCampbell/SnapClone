-- Migration: create message_reads table for read receipts
-- Run with `supabase db push`

create table if not exists message_reads (
  message_id  bigint references messages(id) on delete cascade,
  reader_id   uuid   references profiles(user_id) on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (message_id, reader_id)
);

-- No RLS policies - keep it simple 