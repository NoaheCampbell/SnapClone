-- Migration: allow users to insert into stories when user_id = auth.uid()

drop policy if exists "Stories: insert" on stories;
create policy "Stories: insert" on stories
  for insert with check ( auth.uid() = user_id ); 