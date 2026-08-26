-- Knife (Iron Log) — Phase 7: user feedback.
-- Run this in the SQL editor after every earlier schema file in this
-- folder.
--
-- The Feedback tab (src/feedback-tab.js) only ever inserts here — there
-- is deliberately no select policy for anon or authenticated below, so
-- this table is unreadable from the client entirely, only from the
-- Supabase dashboard or a service-role connection. That's the point:
-- "received in backend, not visible from html."

create table if not exists public.feedback (
  id bigserial primary key,
  user_id uuid not null,
  sender_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;

drop policy if exists "Owner + Diana (anon) can submit feedback" on public.feedback;
create policy "Owner + Diana (anon) can submit feedback"
  on public.feedback for insert
  to anon
  with check (user_id in ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000002'::uuid));

drop policy if exists "Stranger can submit feedback" on public.feedback;
create policy "Stranger can submit feedback"
  on public.feedback for insert
  to authenticated
  with check (user_id = auth.uid());
