-- Add joined_from column to track when users create sprints by joining others
alter table public.sprints
    add column if not exists joined_from uuid references public.sprints(id) on delete set null; 