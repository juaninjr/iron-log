// Supabase, with a localStorage fallback. Every function here branches on
// `useSupabase` and implements both paths — when changing persistence
// logic, update both branches.

import {
  state, useSupabase, supabaseClient, STORAGE_KEY, EXERCISES_STORAGE_KEY,
  activeProfile,
} from "./state.js";
import { exerciseSort } from "./dom-utils.js";

export function currentUserId() {
  return state.currentSession ? state.currentSession.user.id : activeProfile().sentinelId;
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
      const { error } = await supabaseClient.from("workout_entries").delete().in("id", ids);
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
      const { data, error } = await supabaseClient.from("exercises").select("*");
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
        .from("exercises").update({ name: newName }).eq("name", oldName);
      if (exErr) throw exErr;
      const { error: entErr } = await supabaseClient
        .from("workout_entries").update({ exercise: newName }).eq("exercise", oldName);
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
