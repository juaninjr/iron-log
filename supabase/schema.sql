-- Iron Log database schema
-- Run this once in your Supabase project's SQL editor (Project > SQL Editor > New query).

create table if not exists public.workout_entries (
  id text primary key,
  date date not null,
  exercise text not null,
  weight numeric,
  reps numeric,
  logged_at bigint not null
);

create index if not exists workout_entries_logged_at_idx
  on public.workout_entries (logged_at);

-- Row Level Security is on by default for new Supabase tables via the dashboard,
-- but enable it explicitly here in case this is run directly.
alter table public.workout_entries enable row level security;

-- Iron Log has no login system — the anon key below is embedded directly in
-- index.html, so anyone who has it can read/write this table. That's an
-- accepted trade-off for a single-user personal tracker with no backend.
-- Do not reuse this anon key for a Supabase project that holds other data.
drop policy if exists "Allow anon full access" on public.workout_entries;
create policy "Allow anon full access"
  on public.workout_entries
  for all
  using (true)
  with check (true);
