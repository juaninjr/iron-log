-- Knife (Iron Log) — Phase 3: a second profile, Diana.
-- Run this in the SQL editor AFTER schema.sql and auth_schema.sql.
--
-- Do NOT put real Q&A answers or the computed cell values in this file,
-- or any other file in this repo. The two `diana_qa` rows seeded below
-- are placeholders (not real secrets) — replace them afterward with an
-- `update` you run yourself, not committed anywhere.

-- ---------- Generalize the single-owner secret ----------
-- owner_secret (auth_schema.sql) was a strict one-row singleton. Diana
-- needs her own correct cell too, so this generalizes it into one table
-- keyed by profile — owner_secret itself is left in place (not dropped),
-- so this migration is safe to re-run and nothing is lost if you ever
-- want to roll back.
create table if not exists public.profile_secrets (
  profile text primary key,
  correct_cell int not null check (correct_cell >= 0 and correct_cell < 400),
  updated_at timestamptz not null default now()
);
alter table public.profile_secrets enable row level security;
-- No anon/authenticated policies — same as owner_secret, only a
-- service-role client (the verify-figurine Edge Function) can read this.

insert into public.profile_secrets (profile, correct_cell)
select 'owner', correct_cell from public.owner_secret where id = 1
on conflict (profile) do nothing;

-- Diana's cell: one to the right of the owner's in the 20-wide grid,
-- computed from the just-migrated row so the literal number never has to
-- appear here or in chat. Caveat: if the owner's cell sits at the right
-- edge of a row (column 20 of 20), +1 wraps to the next row's leftmost
-- cell instead of visibly "the box to the right" — worth a quick look at
-- the grid after running this.
insert into public.profile_secrets (profile, correct_cell)
select 'diana', correct_cell + 1 from public.profile_secrets where profile = 'owner'
on conflict (profile) do nothing;

-- ---------- Diana's sentinel UUID gets the same data access as the owner's ----------
-- exercises.muscle was restricted to the owner's 6 categories; Diana's
-- profile uses 4 different ones (two new: 'upper', 'glutes').
alter table public.exercises drop constraint if exists exercises_muscle_check;
alter table public.exercises add constraint exercises_muscle_check
  check (muscle in ('chest','back','shoulders','arms','core','legs','upper','glutes'));

-- The anon-role policies (auth_schema.sql) only ever scoped to the
-- owner's sentinel UUID — widen both to also allow Diana's, so her
-- anon-key session (she never goes through real Supabase Auth, same as
-- the owner) can read/write her own rows.
drop policy if exists "Owner (anon) full access to owner rows" on public.workout_entries;
drop policy if exists "Owner + Diana (anon) full access to their sentinel rows" on public.workout_entries;
create policy "Owner + Diana (anon) full access to their sentinel rows"
  on public.workout_entries for all
  to anon
  using (user_id in ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000002'::uuid))
  with check (user_id in ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000002'::uuid));

drop policy if exists "Owner (anon) full access to owner rows" on public.exercises;
drop policy if exists "Owner + Diana (anon) full access to their sentinel rows" on public.exercises;
create policy "Owner + Diana (anon) full access to their sentinel rows"
  on public.exercises for all
  to anon
  using (user_id in ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000002'::uuid))
  with check (user_id in ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000002'::uuid));

-- ---------- Diana's security-question dictionary ----------
-- No anon/authenticated policies — only the diana-qa Edge Function
-- (service role) can ever read this, same reasoning as owner_secret.
create table if not exists public.diana_qa (
  id serial primary key,
  question text not null,
  answer text not null
);
alter table public.diana_qa enable row level security;

-- Placeholders, not real secrets — safe to commit. Replace with real
-- questions/answers via the table editor or your own `update` statement
-- once you're ready (matched case-insensitively, trimmed, by the Edge
-- Function — see supabase/functions/diana-qa/index.ts).
insert into public.diana_qa (question, answer) values
  ('PLACEHOLDER — replace with a real question', 'placeholder-answer-1'),
  ('PLACEHOLDER — replace with a second real question', 'placeholder-answer-2')
on conflict do nothing;

-- Server-side rate limiting for the Q&A step, independent of the
-- figurine grid's own cooldown (figurine_attempts) since it's a
-- different step in the flow.
create table if not exists public.diana_qa_attempts (
  id bigserial primary key,
  ip text not null,
  success boolean not null,
  attempted_at timestamptz not null default now()
);
alter table public.diana_qa_attempts enable row level security;
create index if not exists diana_qa_attempts_ip_time_idx
  on public.diana_qa_attempts (ip, attempted_at desc);

-- ---------- The owner's on/off toggle for Diana's Q&A gate ----------
-- Unlike the tables above, this ISN'T a secret — it's just the owner's
-- switch, and the owner's session only ever has the anon key (no real
-- Supabase Auth account) to read/write it with. Same "gates the page,
-- not the data" trade-off the rest of this gate already accepts.
create table if not exists public.diana_gate_settings (
  id int primary key default 1,
  gate_enabled boolean not null default true,
  constraint diana_gate_settings_singleton check (id = 1)
);
alter table public.diana_gate_settings enable row level security;
drop policy if exists "Allow anon full access" on public.diana_gate_settings;
create policy "Allow anon full access"
  on public.diana_gate_settings
  for all
  using (true)
  with check (true);

insert into public.diana_gate_settings (id, gate_enabled) values (1, true)
on conflict (id) do nothing;
