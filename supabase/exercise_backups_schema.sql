-- Knife (Iron Log) — Phase 4: safety backups for deleted exercises.
-- Run this in the SQL editor after schema.sql, auth_schema.sql, and
-- diana_schema.sql.
--
-- deleteExerciseFlow() (src/exercises-tab.js) writes one row here right
-- before it permanently deletes an exercise (and, if it had any, every
-- logged set referencing it) — the delete only proceeds if this insert
-- succeeds, so a failed backup always means nothing was deleted, never
-- the other way around. Write-only from the app's side: there's no
-- restore UI, just a durable copy of exactly what was removed (the full
-- exercise definition + every one of its entries, as JSON) to recover
-- from by hand — via the table editor, or a plain `insert into
-- workout_entries/exercises select ...` — if a deletion ever turns out to
-- have been a mistake.

create table if not exists public.deleted_exercise_backups (
  id bigserial primary key,
  user_id uuid not null,
  exercise_name text not null,
  exercise jsonb not null,
  entries jsonb not null,
  deleted_at timestamptz not null default now()
);
alter table public.deleted_exercise_backups enable row level security;
create index if not exists deleted_exercise_backups_user_id_idx
  on public.deleted_exercise_backups (user_id);

-- Same per-profile RLS shape as workout_entries/exercises (auth_schema.sql,
-- diana_schema.sql): the owner's and Diana's anon-key sessions are scoped
-- to their two fixed sentinel UUIDs, a signed-up stranger's authenticated
-- session is scoped to their own auth.uid(). Deliberately write-accessible
-- (not read-only) to whoever owns the row, same as every other table here
-- — this app already accepts "gates the page, not the data" as its
-- security model, and a backup table with a stricter policy than the
-- live data it's backing up wouldn't add real protection.
drop policy if exists "Owner + Diana (anon) full access to their sentinel rows" on public.deleted_exercise_backups;
create policy "Owner + Diana (anon) full access to their sentinel rows"
  on public.deleted_exercise_backups for all
  to anon
  using (user_id in ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000002'::uuid))
  with check (user_id in ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000002'::uuid));

drop policy if exists "Stranger full access to own rows" on public.deleted_exercise_backups;
create policy "Stranger full access to own rows"
  on public.deleted_exercise_backups for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
