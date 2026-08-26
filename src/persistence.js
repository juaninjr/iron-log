// Supabase, with a localStorage fallback. Every function here branches on
// `useSupabase` and implements both paths — when changing persistence
// logic, update both branches.
//
// Every query against `exercises`/`workout_entries` MUST filter by
// `.eq("user_id", currentUserId())` — RLS alone does NOT isolate the
// owner from Diana, because both share the same public anon key (there's
// no per-profile credential for Postgres to key off of); the anon-role
// policy on those tables (supabase/diana_schema.sql) is deliberately an
// OR across both sentinel UUIDs, not a single one, so it only bounds
// which rows *any* anon request can touch, not which profile's rows a
// *given* request should. A query missing this filter will silently
// return/touch both profiles' rows — this happened for real (loadEntries,
// loadExercises, renameExercise all shipped without it) and showed up as
// exercises added under one profile appearing under the other. Writes are
// still safe without an extra filter as long as the row's own `user_id`
// is set to `currentUserId()` (entryToRow()/exerciseToRow() already do
// this) — RLS's `with check` rejects anything else — it's reads,
// updates, and un-id-scoped deletes that need the explicit `.eq()`.

import {
  state, useSupabase, supabaseClient, STORAGE_KEY, EXERCISES_STORAGE_KEY,
  EXERCISE_BACKUPS_STORAGE_KEY, TODAY_PLAN_STORAGE_KEY, activeProfile,
} from "./state.js";
import { exerciseSort, todayISO } from "./dom-utils.js";

export function currentUserId() {
  return state.currentSession ? state.currentSession.user.id : activeProfile().sentinelId;
}

// A human-readable name for whoever's logged in — used by the Feedback
// tab's thank-you message. Not an identity/security concept, just copy.
export function currentUserLabel() {
  if (state.currentSession) return state.currentSession.user.email;
  return activeProfile().key === "owner" ? "Owner" : "Diana";
}

// The localStorage fallback keys stay unsuffixed for the owner (backward
// compatible with data saved before Diana existed); Diana gets her own
// suffixed key so the two profiles' localStorage-fallback data never mix
// on the same browser. Only matters when useSupabase is false — the real
// database is already scoped per-profile via currentUserId()/RLS.
function profileScopedKey(base) {
  return activeProfile().key === "owner" ? base : `${base}:${activeProfile().key}`;
}

function rowToEntry(row) {
  return {
    id: row.id,
    date: row.date,
    exercise: row.exercise,
    weight: row.weight,
    reps: row.reps,
    distance: row.distance ?? null,
    duration: row.duration ?? null,
    loggedAt: Number(row.logged_at),
  };
}

function entryToRow(e) {
  return {
    id: e.id,
    date: e.date,
    exercise: e.exercise,
    weight: e.weight,
    reps: e.reps,
    distance: e.distance ?? null,
    duration: e.duration ?? null,
    logged_at: e.loggedAt,
    user_id: currentUserId(),
  };
}

function rowToExercise(row) {
  return {
    name: row.name,
    muscle: row.muscle,
    perHand: row.per_hand,
    repsOnly: row.reps_only,
    cardio: Boolean(row.cardio),
    min: row.min,
    max: row.max,
    step: row.step,
    backbone: row.backbone,
  };
}

function exerciseToRow(ex) {
  return {
    name: ex.name,
    muscle: ex.muscle,
    per_hand: Boolean(ex.perHand),
    reps_only: Boolean(ex.repsOnly),
    cardio: Boolean(ex.cardio),
    min: ex.min ?? null,
    max: ex.max ?? null,
    step: ex.step ?? null,
    backbone: Boolean(ex.backbone),
    user_id: currentUserId(),
  };
}

export async function loadEntries() {
  if (useSupabase) {
    try {
      const { data, error } = await supabaseClient
        .from("workout_entries")
        .select("*")
        .eq("user_id", currentUserId())
        .order("logged_at", { ascending: true });
      if (error) throw error;
      state.entries = data.map(rowToEntry);
    } catch (e) {
      console.error("Supabase load error", e);
      alert("Could not load workouts from the database.");
      state.entries = [];
    }
    return;
  }
  try {
    const raw = localStorage.getItem(profileScopedKey(STORAGE_KEY));
    state.entries = raw ? JSON.parse(raw) : [];
  } catch (e) {
    state.entries = [];
  }
}

// Upserts `rows` (defaults to the full `state.entries` array) into the
// database. Returns true on success, false on failure (after alerting
// the user).
export async function saveEntries(rows) {
  if (useSupabase) {
    try {
      const payload = (rows || state.entries).map(entryToRow);
      if (payload.length === 0) return true;
      const { error } = await supabaseClient
        .from("workout_entries")
        .upsert(payload, { onConflict: "id" });
      if (error) throw error;
      return true;
    } catch (e) {
      console.error("Supabase save error", e);
      alert("Could not save to the database — your last change may not persist.");
      return false;
    }
  }
  try {
    localStorage.setItem(profileScopedKey(STORAGE_KEY), JSON.stringify(state.entries));
    return true;
  } catch (e) {
    console.error("Storage error", e);
    alert("Could not save — your last change may not persist.");
    return false;
  }
}

// Deletes entries by id. Callers must remove them from state.entries
// first (the localStorage branch persists current state).
export async function deleteEntries(ids) {
  if (ids.length === 0) return true;
  if (useSupabase) {
    try {
      const { error } = await supabaseClient.from("workout_entries").delete().eq("user_id", currentUserId()).in("id", ids);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error("Supabase delete error", e);
      alert("Could not delete from the database.");
      return false;
    }
  }
  try {
    localStorage.setItem(profileScopedKey(STORAGE_KEY), JSON.stringify(state.entries));
    return true;
  } catch (e) {
    console.error("Storage error", e);
    alert("Could not save the deletion.");
    return false;
  }
}

// Loads the exercise roster, seeding the database/localStorage with the
// active profile's default exercises the first time there's nothing
// stored yet.
export async function loadExercises() {
  if (useSupabase) {
    try {
      const { data, error } = await supabaseClient.from("exercises").select("*").eq("user_id", currentUserId());
      if (error) throw error;
      if (data.length === 0) {
        const seedRows = activeProfile().defaultExercises.map(exerciseToRow);
        const { error: seedError } = await supabaseClient.from("exercises").insert(seedRows);
        if (seedError) throw seedError;
        state.EXERCISES = activeProfile().defaultExercises.map(ex => ({ ...ex }));
      } else {
        state.EXERCISES = data.map(rowToExercise);
      }
    } catch (e) {
      console.error("Supabase exercises load error", e);
      alert("Could not load exercises from the database.");
      state.EXERCISES = activeProfile().defaultExercises.map(ex => ({ ...ex }));
    }
  } else {
    try {
      const raw = localStorage.getItem(profileScopedKey(EXERCISES_STORAGE_KEY));
      if (raw) {
        state.EXERCISES = JSON.parse(raw);
      } else {
        state.EXERCISES = activeProfile().defaultExercises.map(ex => ({ ...ex }));
        localStorage.setItem(profileScopedKey(EXERCISES_STORAGE_KEY), JSON.stringify(state.EXERCISES));
      }
    } catch (e) {
      state.EXERCISES = activeProfile().defaultExercises.map(ex => ({ ...ex }));
    }
  }
  state.EXERCISES.sort(exerciseSort);
}

// Upserts a single exercise (new or edited) into the database.
export async function saveExercise(ex) {
  if (useSupabase) {
    try {
      const { error } = await supabaseClient
        .from("exercises")
        .upsert([exerciseToRow(ex)], { onConflict: "user_id,name" });
      if (error) throw error;
      return true;
    } catch (e) {
      console.error("Supabase exercise save error", e);
      alert("Could not save the exercise to the database.");
      return false;
    }
  }
  try {
    localStorage.setItem(profileScopedKey(EXERCISES_STORAGE_KEY), JSON.stringify(state.EXERCISES));
    return true;
  } catch (e) {
    console.error("Storage error", e);
    alert("Could not save the exercise.");
    return false;
  }
}

// Renames an exercise, updating the exercises row and every logged entry
// that references the old name (no DB foreign key ties them together, so
// both need an explicit update).
export async function renameExercise(ex, newName) {
  const oldName = ex.name;
  if (useSupabase) {
    try {
      const { error: exErr } = await supabaseClient
        .from("exercises").update({ name: newName }).eq("user_id", currentUserId()).eq("name", oldName);
      if (exErr) throw exErr;
      const { error: entErr } = await supabaseClient
        .from("workout_entries").update({ exercise: newName }).eq("user_id", currentUserId()).eq("exercise", oldName);
      if (entErr) throw entErr;
    } catch (e) {
      console.error("Supabase rename error", e);
      alert("Could not rename the exercise in the database.");
      return false;
    }
  }

  ex.name = newName;
  state.entries.forEach(en => { if (en.exercise === oldName) en.exercise = newName; });

  if (!useSupabase) {
    try {
      localStorage.setItem(profileScopedKey(EXERCISES_STORAGE_KEY), JSON.stringify(state.EXERCISES));
      localStorage.setItem(profileScopedKey(STORAGE_KEY), JSON.stringify(state.entries));
    } catch (e) {
      console.error("Storage error", e);
      alert("Could not save the rename.");
      return false;
    }
  }
  return true;
}

// Snapshots an exercise (and, if it has any, every logged set referencing
// it) before deleteExerciseFlow() (exercises-tab.js) permanently removes
// them — called first, and the delete only proceeds if this succeeds, so
// a failed backup never lets data disappear with no copy of it anywhere.
// Write-only from the app's side; there's no restore UI, just a durable
// copy of what was deleted (the deleted_exercise_backups table, or its
// localStorage-fallback array) to recover from by hand if a deletion ever
// turns out to have been a mistake.
export async function backupExerciseDeletion(ex, entries) {
  if (useSupabase) {
    try {
      const { error } = await supabaseClient.from("deleted_exercise_backups").insert({
        user_id: currentUserId(),
        exercise_name: ex.name,
        exercise: ex,
        entries,
      });
      if (error) throw error;
      return true;
    } catch (e) {
      console.error("Exercise backup error", e);
      alert("Could not create a safety backup — nothing was deleted.");
      return false;
    }
  }
  try {
    const key = profileScopedKey(EXERCISE_BACKUPS_STORAGE_KEY);
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    existing.push({ exercise_name: ex.name, exercise: ex, entries, deleted_at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(existing));
    return true;
  } catch (e) {
    console.error("Exercise backup error", e);
    alert("Could not create a safety backup — nothing was deleted.");
    return false;
  }
}

// Deletes the exercise's own row/entry from the roster. Callers remove it
// from state.EXERCISES first (the localStorage branch persists whatever
// state.EXERCISES currently holds) — same "mutate state first" pattern
// every other persistence function here follows. Does not touch logged
// entries; deleteExerciseFlow() calls deleteEntries() separately for
// those, and only calls this after that succeeds.
export async function deleteExercise(ex) {
  if (useSupabase) {
    try {
      const { error } = await supabaseClient
        .from("exercises")
        .delete()
        .eq("user_id", currentUserId())
        .eq("name", ex.name);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error("Supabase delete exercise error", e);
      alert("Could not delete the exercise from the database.");
      return false;
    }
  }
  try {
    localStorage.setItem(profileScopedKey(EXERCISES_STORAGE_KEY), JSON.stringify(state.EXERCISES));
    return true;
  } catch (e) {
    console.error("Storage error", e);
    alert("Could not delete the exercise.");
    return false;
  }
}

// Loads the Today's Workout plan (state.todayPlan/todayPlanDate) — one
// row/key per profile (per user_id, or profileScopedKey() in the
// localStorage fallback). If the stored plan belongs to an earlier date
// than today, it's treated as empty in memory without writing anything
// back yet — the plan only needs to persist once something is actually
// added today (see addToTodayPlan(), log-tab.js), so an idle reload on a
// new day doesn't cost a write.
export async function loadTodayPlan() {
  const today = todayISO();
  if (useSupabase) {
    try {
      const { data, error } = await supabaseClient
        .from("today_plans")
        .select("plan_date, exercises")
        .eq("user_id", currentUserId())
        .maybeSingle();
      if (error) throw error;
      if (data && data.plan_date === today) {
        state.todayPlan = data.exercises || [];
        state.todayPlanDate = today;
      } else {
        state.todayPlan = [];
        state.todayPlanDate = null;
      }
    } catch (e) {
      console.error("Supabase today-plan load error", e);
      state.todayPlan = [];
      state.todayPlanDate = null;
    }
    return;
  }
  try {
    const raw = localStorage.getItem(profileScopedKey(TODAY_PLAN_STORAGE_KEY));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.planDate === today) {
      state.todayPlan = parsed.exercises || [];
      state.todayPlanDate = today;
    } else {
      state.todayPlan = [];
      state.todayPlanDate = null;
    }
  } catch (e) {
    state.todayPlan = [];
    state.todayPlanDate = null;
  }
}

// Upserts the current Today's Workout plan. Callers (addToTodayPlan()/
// removeFromTodayPlan(), log-tab.js) set state.todayPlanDate = todayISO()
// before calling this, same "mutate state first, then await persistence"
// pattern every other function here follows.
export async function saveTodayPlan() {
  if (useSupabase) {
    try {
      const { error } = await supabaseClient
        .from("today_plans")
        .upsert(
          { user_id: currentUserId(), plan_date: state.todayPlanDate, exercises: state.todayPlan },
          { onConflict: "user_id" }
        );
      if (error) throw error;
      return true;
    } catch (e) {
      console.error("Supabase today-plan save error", e);
      alert("Could not save today's plan to the database.");
      return false;
    }
  }
  try {
    localStorage.setItem(
      profileScopedKey(TODAY_PLAN_STORAGE_KEY),
      JSON.stringify({ planDate: state.todayPlanDate, exercises: state.todayPlan })
    );
    return true;
  } catch (e) {
    console.error("Storage error", e);
    alert("Could not save today's plan.");
    return false;
  }
}
