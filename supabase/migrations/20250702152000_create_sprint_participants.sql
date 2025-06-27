-- Create table to track who joined an existing sprint
create table if not exists public.sprint_participants (
  sprint_id uuid references public.sprints(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (sprint_id, user_id)
);

-- Convenience index for queries by user
create index if not exists sprint_participants_user_idx on public.sprint_participants(user_id); 