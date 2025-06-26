-- Migration: message reactions

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍','🔥','📚')),
  created_at timestamptz default now(),
  unique(message_id, user_id) -- one reaction per user per message
);

-- Index for fast lookup by message
create index if not exists idx_message_reactions_message on public.message_reactions(message_id); 