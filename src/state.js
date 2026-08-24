// Shared state for the whole app. There's no framework here, so instead
// of individual `let` bindings (which ES modules only let other files
// read live, not reassign), every mutable piece of app state lives as a
// property on the single exported `state` object — any module can freely
// do `state.entries = ...` or `state.entries.push(...)` without needing
// setter functions. Static config/constants that never change after
// load are plain named exports below.

import { createClient } from "@supabase/supabase-js";

export const MUSCLES = ["chest", "back", "shoulders", "arms", "core", "legs"];
export const MUSCLE_LABELS = { chest: "Chest", back: "Back", shoulders: "Shoulders", arms: "Arms", core: "Core", legs: "Legs" };
// Validated categorical palette (first 6 of 8 slots — a prefix of an
// already-validated ordering stays CVD-safe), one fixed color per muscle.
export const MUSCLE_COLORS = {
  chest: "#2a78d6",
  back: "#1baf7a",
  shoulders: "#eda100",
  arms: "#008300",
  core: "#4a3aa7",
  legs: "#e34948",
};

// The original fixed roster — seeded into the database on first run and
// used as the fallback if the database is unreachable. These are the
// "backbone" exercises: the pool Suggested draws from. Exercises added
// later through the Exercises tab start as non-backbone.
export const DEFAULT_EXERCISES = [
  { name: "Long Biceps",       perHand: true,  min: 4,  max: 20,  step: 2, muscle: "arms",      backbone: true },
  { name: "Short Biceps",      perHand: false, min: 5,  max: 20,  step: 1, muscle: "arms",      backbone: true },
  { name: "Bench Dumbbell",    perHand: true,  min: 40, max: 100, step: 2, muscle: "chest",     backbone: true },
  { name: "Bench",             perHand: false, min: 40, max: 100, step: 5, muscle: "chest",     backbone: true },
  { name: "Militar",           perHand: false, min: 15, max: 30,  step: 1, muscle: "shoulders", backbone: true },
  { name: "Lat Raises",        perHand: true,  min: 4,  max: 20,  step: 2, muscle: "shoulders", backbone: true },
  { name: "Rear Delt Flies",   perHand: true,  min: 4,  max: 20,  step: 2, muscle: "shoulders", backbone: true },
  { name: "Triceps Pulldown",  perHand: false, min: 1,  max: 10,  step: 1, muscle: "arms",      backbone: true },
  { name: "Triceps Horizontal",perHand: false, min: 5,  max: 40,  step: 5, muscle: "arms",      backbone: true },
  { name: "Bulgarian",         perHand: false, min: 0,  max: 100, step: 5, muscle: "legs",      backbone: true },
  { name: "Squats Máquina",    perHand: false, min: 0,  max: 200, step: 5, muscle: "legs",      backbone: true },
  { name: "Core Workout",      perHand: false, min: 0,  max: 100, step: 1, muscle: "core",      backbone: true },
  { name: "Pushups",           repsOnly: true, muscle: "chest", backbone: true },
];

export const STORAGE_KEY = "ironlog:entries";
export const EXERCISES_STORAGE_KEY = "ironlog:exercises";

// ---------- Database config (Supabase) ----------
// Fill these in after creating a Supabase project and running supabase/schema.sql.
// See README.md for setup steps. Until both are set, the app falls back to
// browser localStorage so it keeps working.
export const SUPABASE_URL = "https://uknmyetlpbpjiauyuvpp.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrbm15ZXRscGJwamlhdXl1dnBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDU3ODEsImV4cCI6MjEwMjYyMTc4MX0.rfkPJ4fgOXMkjxeS-FFqmGMp48A6OGjGYS4qhUwQE1U";

export const useSupabase = Boolean(
  SUPABASE_URL && !SUPABASE_URL.startsWith("YOUR_") &&
  SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("YOUR_")
);
export const supabaseClient = useSupabase
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Phase 2 gate (figurine-grid owner login + "I'm a stranger" signup).
// Leave false until you've run supabase/auth_schema.sql, deployed the
// verify-figurine Edge Function, and seeded the owner_secret row —
// flipping this on before that's done would lock you out of your own
// app, since the gate has no working backend to check against yet.
export const GATE_ENABLED = true;
export const OWNER_UNLOCK_KEY = "ironlog:ownerUnlocked";
// Fixed placeholder id for the owner's rows — see supabase/auth_schema.sql
// for why (Postgres keys can't contain NULL, and exercise names need to
// be unique per-user, not globally).
export const OWNER_SENTINEL_ID = "00000000-0000-0000-0000-000000000000";

export const VIEW_IDS = {
  log: "viewLog",
  progress: "viewProgress",
  calendar: "viewCalendar",
  suggested: "viewSuggested",
  exercises: "viewExercises",
};

export const SVG_NS = "http://www.w3.org/2000/svg";

// A fixed small set of blob/alien shapes, reused across the figurine grid
// in random colors/positions each load — decorative only, unrelated to
// which cell is correct (the client never learns that).
export const FIGURINE_COLORS = ["#cc382a", "#e8574a", "#a62d21", "#b4e5c8", "#7fcda0", "#3fa876", "#2a2a2a", "#8a8a8a"];
// Swap the gate's decorative art to PNGs later by just filling this in
// (e.g. ["/images/figurines/1.png", ...]) — renderFigurineCell() picks a
// random one and renders an <img> instead of generating SVG.
// onFigurineClick() only ever sees the cell's grid index, never how it
// was drawn, so this is the only thing to touch.
export const FIGURINE_IMAGES = [];

// ---------- Mutable app state ----------
const calMonth = new Date();
calMonth.setDate(1);

export const state = {
  EXERCISES: [], // populated at load time from the database (or localStorage fallback)
  entries: [],
  editingGroupKey: null,
  currentView: "log",
  calMonth,
  // Progress-chart filters: which muscle groups are visible per chart.
  weightFilterSelected: new Set(MUSCLES),
  repsFilterSelected: new Set(MUSCLES),
  // Log-tab filter: which muscle groups show their exercise blocks.
  logMuscleFilter: new Set(MUSCLES),
  // Fun-fact comparisons (loaded once from /data/comparisons.txt), and the
  // fact picked for this page load — stays fixed until the page reloads.
  funFactComparisons: [],
  // The signed-in stranger's session, if any — null for the owner (who
  // never goes through Supabase Auth) and for localStorage-only mode.
  currentSession: null,
  gateLocked: false,
  strangerMode: "signin",
};
