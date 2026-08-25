-- Knife (Iron Log) — Phase 5: the "Today's Workout" plan.
-- Run this in the SQL editor after schema.sql, auth_schema.sql,
-- diana_schema.sql, and exercise_backups_schema.sql.
--
-- Exercises picked via the "Create Plan" / wheel pickers (log-tab.js's
-- addToTodayPlan()/removeFromTodayPlan(), persistence.js's
-- loadTodayPlan()/saveTodayPlan()) before any sets are actually logged
-- for them. One row per user_id — the whole plan is overwritten on every
-- save, not appended to, since there's no need to keep past days' plans;
-- plan_date is what lets the app tell a stale (yesterday's) plan apart
-- from today's without a separate cron/reset job — loadTodayPlan() just
-- treats a non-matching plan_date as empty.

create table if not exists public.today_plans (
  user_id uuid primary key,
  plan_date date not null,
  exercises text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.today_plans enable row level security;

-- Same per-profile RLS shape as every other table here (auth_schema.sql,
-- diana_schema.sql, exercise_backups_schema.sql): the owner's and Diana's
-- anon-key sessions are scoped to their two fixed sentinel UUIDs, a
-- signed-up stranger's authenticated session is scoped to their own
-- auth.uid(). Same "gates the page, not the data" security model as the
-- rest of this app — see persistence.js's own header comment.
drop policy if exists "Owner + Diana (anon) full access to their sentinel rows" on public.today_plans;
create policy "Owner + Diana (anon) full access to their sentinel rows"
  on public.today_plans for all
  to anon
  using (user_id in ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000002'::uuid))
  with check (user_id in ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000002'::uuid));

drop policy if exists "Stranger full access to own rows" on public.today_plans;
create policy "Stranger full access to own rows"
  on public.today_plans for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
