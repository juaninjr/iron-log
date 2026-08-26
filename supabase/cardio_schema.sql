-- Knife (Iron Log) — Phase 6: the owner's "Cardio" category.
-- Run this in the SQL editor after every earlier schema file in this
-- folder.
--
-- Cardio exercises (Run, Row, …) log distance (km) + time (minutes)
-- instead of weight/reps — src/log-tab.js's addSetRow()/buildGroupEditRow()
-- render distance/duration inputs for any exercise with cardio = true.

-- Same pattern diana_schema.sql already used to widen this constraint.
alter table public.exercises drop constraint if exists exercises_muscle_check;
alter table public.exercises add constraint exercises_muscle_check
  check (muscle in ('chest','back','shoulders','arms','core','legs','upper','glutes','cardio'));

alter table public.exercises add column if not exists cardio boolean not null default false;

alter table public.workout_entries add column if not exists distance numeric;
alter table public.workout_entries add column if not exists duration numeric;
