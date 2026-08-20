-- Iron Log — Phase 2: Supabase Auth + figurine-grid owner gate.
-- Run this in the SQL editor AFTER schema.sql.
--
-- Do NOT put the correct figurine cell value in this file, or any other
-- file in this repo — it must never be committed. Claude gives you a
-- one-off SQL snippet in chat (not saved anywhere) to seed it directly.

-- ---------- Per-user scoping for existing tables ----------
-- Postgres primary/unique keys can't contain NULL, and exercises.name was
-- the primary key — with multiple users, two people's "Bench" would
-- collide. Fix: give the owner a fixed sentinel UUID instead of NULL, so
-- every row (owner or stranger) always has a real, non-null user_id, and
-- (user_id, name) can be a normal composite key. Sentinel used throughout:
-- 00000000-0000-0000-0000-000000000000

alter table public.workout_entries
  add column if not exists user_id uuid not null
    default '00000000-0000-0000-0000-000000000000'::uuid;
alter table public.exercises
  add column if not exists user_id uuid not null
    default '00000000-0000-0000-0000-000000000000'::uuid;

-- exercises.name was globally unique; make it unique per-user instead.
alter table public.exercises drop constraint if exists exercises_pkey;
alter table public.exercises add primary key (user_id, name);

create index if not exists workout_entries_user_id_idx on public.workout_entries(user_id);

-- Replace the old "anyone with the anon key can do anything" policy with
-- two narrower ones: the owner (anon role) only touches the sentinel's
-- rows; a signed-in stranger (authenticated role) only touches their own.
drop policy if exists "Allow anon full access" on public.workout_entries;
drop policy if exists "Owner (anon) full access to owner rows" on public.workout_entries;
create policy "Owner (anon) full access to owner rows"
  on public.workout_entries for all
  to anon
  using (user_id = '00000000-0000-0000-0000-000000000000'::uuid)
  with check (user_id = '00000000-0000-0000-0000-000000000000'::uuid);
drop policy if exists "Stranger full access to own rows" on public.workout_entries;
create policy "Stranger full access to own rows"
  on public.workout_entries for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Allow anon full access" on public.exercises;
drop policy if exists "Owner (anon) full access to owner rows" on public.exercises;
create policy "Owner (anon) full access to owner rows"
  on public.exercises for all
  to anon
  using (user_id = '00000000-0000-0000-0000-000000000000'::uuid)
  with check (user_id = '00000000-0000-0000-0000-000000000000'::uuid);
drop policy if exists "Stranger full access to own rows" on public.exercises;
create policy "Stranger full access to own rows"
  on public.exercises for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- Stranger profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Users manage their own profile" on public.profiles;
create policy "Users manage their own profile"
  on public.profiles for all
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Owner secret (the correct figurine cell) ----------
-- No policies are created for anon/authenticated — RLS defaults to deny,
-- so only a service-role client (the Edge Function) can ever read this.
create table if not exists public.owner_secret (
  id int primary key default 1,
  correct_cell int not null check (correct_cell >= 0 and correct_cell < 400),
  updated_at timestamptz not null default now(),
  constraint owner_secret_singleton check (id = 1)
);
alter table public.owner_secret enable row level security;

-- ---------- Server-side rate limiting for grid attempts ----------
-- Also no anon/authenticated policies — only the Edge Function (service
-- role) touches this, so the cooldown can't be bypassed by editing
-- client-side state or replaying requests with different client timers.
create table if not exists public.figurine_attempts (
  id bigserial primary key,
  ip text not null,
  success boolean not null,
  attempted_at timestamptz not null default now()
);
alter table public.figurine_attempts enable row level security;
create index if not exists figurine_attempts_ip_time_idx
  on public.figurine_attempts (ip, attempted_at desc);
