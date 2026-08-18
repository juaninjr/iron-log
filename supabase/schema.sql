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

-- Exercise roster: the fixed list seeds itself here on first load (see
-- loadExercises() in index.html). "backbone" marks the exercises the
-- Suggested tab draws from — exercises added later start as non-backbone
-- until toggled on in the Exercises tab.
create table if not exists public.exercises (
  name text primary key,
  muscle text not null check (muscle in ('chest','back','shoulders','arms','core','legs')),
  per_hand boolean not null default false,
  reps_only boolean not null default false,
  min numeric,
  max numeric,
  step numeric,
  backbone boolean not null default false
);

alter table public.exercises enable row level security;

drop policy if exists "Allow anon full access" on public.exercises;
create policy "Allow anon full access"
  on public.exercises
  for all
  using (true)
  with check (true);
