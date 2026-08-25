// Shared state for the whole app. There's no framework here, so instead
// of individual `let` bindings (which ES modules only let other files
// read live, not reassign), every mutable piece of app state lives as a
// property on the single exported `state` object — any module can freely
// do `state.entries = ...` or `state.entries.push(...)` without needing
// setter functions. Static config/constants that never change after
// load are plain named exports below.

import { createClient } from "@supabase/supabase-js";

// The owner's muscle categories/colors/seed roster — now folded into
// PROFILES.owner below rather than exported flat, since every consumer
// (log-tab.js, progress-tab.js, suggested-tab.js, exercises-tab.js,
// wheel3d.js) needs to read whichever profile is actually active, not
// always the owner's. Kept as local consts (not exported) purely so
// PROFILES.owner's literal below stays readable.
const OWNER_MUSCLES = ["chest", "back", "shoulders", "arms", "core", "legs"];
const OWNER_MUSCLE_LABELS = { chest: "Chest", back: "Back", shoulders: "Shoulders", arms: "Arms", core: "Core", legs: "Legs" };
// Validated categorical palette (first 6 of 8 slots — a prefix of an
// already-validated ordering stays CVD-safe), one fixed color per muscle.
const OWNER_MUSCLE_COLORS = {
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

// Diana's seed roster — her own 4 categories (upper body general, glutes,
// legs, core), each with enough backbone coverage for the Suggested tab
// to have something to draw from in every group.
export const DIANA_DEFAULT_EXERCISES = [
  { name: "Hip Thrust",      perHand: false, min: 20, max: 150, step: 5,  muscle: "glutes", backbone: true },
  { name: "Glute Bridge",    perHand: false, min: 0,  max: 100, step: 5,  muscle: "glutes", backbone: true },
  { name: "Cable Kickbacks", perHand: true,  min: 2,  max: 20,  step: 1,  muscle: "glutes", backbone: true },
  { name: "Squats",          perHand: false, min: 0,  max: 150, step: 5,  muscle: "legs",   backbone: true },
  { name: "Lunges",          perHand: true,  min: 0,  max: 40,  step: 2,  muscle: "legs",   backbone: true },
  { name: "Leg Press",       perHand: false, min: 20, max: 200, step: 10, muscle: "legs",   backbone: true },
  { name: "Push-Ups",        repsOnly: true, muscle: "upper", backbone: true },
  { name: "Dumbbell Rows",   perHand: true,  min: 4,  max: 30,  step: 2,  muscle: "upper",  backbone: true },
  { name: "Shoulder Press",  perHand: false, min: 5,  max: 30,  step: 1,  muscle: "upper",  backbone: true },
  { name: "Core Workout",    repsOnly: true, muscle: "core", backbone: true },
  { name: "Plank",           repsOnly: true, muscle: "core", backbone: true },
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

// Diana — a second fixed, named profile (see supabase/diana_schema.sql).
// Same sentinel-UUID trick as the owner, just a different constant, and
// her own localStorage unlock flag so logging out one profile doesn't
// touch the other's.
export const DIANA_SENTINEL_ID = "00000000-0000-0000-0000-000000000002";
export const DIANA_UNLOCK_KEY = "ironlog:dianaUnlocked";

// ---------- Profiles ----------
// Everything that differs per logged-in identity (muscle categories,
// colors, seed exercises, and how the 3D model's named layers map onto
// those categories) lives here, keyed by state.activeProfile — see
// activeProfile() below. Set once at gate-unlock time (gate.js), before
// init() ever renders anything; nothing needs to react to it changing
// mid-session, since a browser session is gated into exactly one profile
// for its duration.
export const PROFILES = {
  owner: {
    key: "owner",
    sentinelId: OWNER_SENTINEL_ID,
    unlockKey: OWNER_UNLOCK_KEY,
    muscles: OWNER_MUSCLES,
    muscleLabels: OWNER_MUSCLE_LABELS,
    muscleColors: OWNER_MUSCLE_COLORS,
    defaultExercises: DEFAULT_EXERCISES,
    // Identity mapping — these keys ARE the 3D model's own named Rhino
    // layers (see models/README.md), so each just matches itself.
    modelLayerAliases: { chest: ["chest"], back: ["back"], shoulders: ["shoulders"], arms: ["arms"], core: ["core"], legs: ["legs"] },
  },
  diana: {
    key: "diana",
    sentinelId: DIANA_SENTINEL_ID,
    unlockKey: DIANA_UNLOCK_KEY,
    muscles: ["upper", "glutes", "legs", "core"],
    muscleLabels: { upper: "Upper Body", glutes: "Glutes", legs: "Legs", core: "Core" },
    // Reuses the same validated categorical hue family as the owner's
    // palette (blue/amber/red/purple), just 4 of them instead of 6.
    muscleColors: { upper: "#2a78d6", glutes: "#eda100", legs: "#e34948", core: "#4a3aa7" },
    defaultExercises: DIANA_DEFAULT_EXERCISES,
    // The shared 3D model (see CLAUDE.md — Diana doesn't have her own
    // female_human.3dm yet) only has chest/back/shoulders/arms/core/legs
    // layers. "upper" is the union of the 4 upper-body ones; "legs" maps
    // directly. "glutes" has no dedicated geometry in this model at all,
    // so it's deliberately left out here — buildMusclePickRow() (log-
    // tab.js) reads .muscles, not this map, so "Glutes" still works as a
    // button-row pick; it just never highlights on the 3D model until a
    // real female_human.3dm with its own glutes layer replaces this.
    modelLayerAliases: { upper: ["chest", "back", "shoulders", "arms"], legs: ["legs"], core: ["core"] },
  },
};

export const VIEW_IDS = {
  log: "viewLog",
  progress: "viewProgress",
  calendar: "viewCalendar",
  suggested: "viewSuggested",
  exercises: "viewExercises",
};

export const SVG_NS = "http://www.w3.org/2000/svg";

// Colors the figurine grid's knife glyph (src/brand.js's knifeGlyphSvg)
// is randomly recolored with, one per cell each load — decorative only,
// unrelated to which cell is correct (the client never learns that).
export const FIGURINE_COLORS = ["#cc382a", "#e8574a", "#a62d21", "#b4e5c8", "#7fcda0", "#3fa876", "#2a2a2a", "#8a8a8a"];
// Swap the gate's decorative art to PNGs later by just filling this in
// (e.g. ["/images/figurines/1.png", ...]) — renderFigurineCell() (gate.js)
// picks a random one and renders an <img> instead of the knife glyph.
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
  // Which profile this session is gated into — "owner" or "diana", set
  // once at gate-unlock time (gate.js) before init() ever runs. See
  // activeProfile() below and PROFILES above.
  activeProfile: "owner",
  // Progress-chart filters: which muscle groups are visible per chart.
  // Built off the owner's muscles at module-load time; resetProfileFilters()
  // (log-tab.js) rebuilds these off the active profile's own muscles right
  // after a non-owner profile is chosen, before anything renders.
  weightFilterSelected: new Set(OWNER_MUSCLES),
  repsFilterSelected: new Set(OWNER_MUSCLES),
  // Log-tab filter: which muscle groups show their exercise blocks.
  logMuscleFilter: new Set(OWNER_MUSCLES),
  // The signed-in stranger's session, if any — null for the owner/Diana
  // (who never go through Supabase Auth) and for localStorage-only mode.
  currentSession: null,
  gateLocked: false,
  dianaQaLocked: false,
  strangerMode: "signin",
  // Cached read of diana_gate_settings.gate_enabled (gate.js's
  // loadDianaGateSetting()) — used by the owner-only toggle in the
  // Exercises tab.
  dianaGateEnabled: true,
};

// The active profile's full config (muscles, colors, seed exercises,
// sentinel id, …) — every module that used to import the owner's flat
// MUSCLES/MUSCLE_LABELS/MUSCLE_COLORS constants now reads them from here
// instead, so it automatically gets Diana's when she's the one logged in.
export function activeProfile() {
  return PROFILES[state.activeProfile];
}
