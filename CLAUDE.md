# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Iron Log — a personal gym workout tracker. Single-user, no login. The entire
app (HTML, CSS, JS) lives in one file, `index.html`, as a vanilla-JS IIFE with
no build step and no framework.

## Commands

There is no build, lint, or test tooling in this repo. To run locally:

```bash
npx serve .
```

Then open the printed localhost URL. Opening `index.html` directly in a
browser also works, except `fetch`-based Supabase calls need a real origin
(not `file://`), so prefer `npx serve`.

There is no automated test suite. Verify changes by running the app in a
browser (or headless via Playwright) and exercising the affected flow —
see "Testing changes" below.

## Architecture

**Everything is in `index.html`**: inline `<style>` block, then a single
`<script>` containing an IIFE with all app logic. There's no bundler, no
modules, no npm dependencies. Third-party libraries (jsPDF, jsPDF-autotable,
Supabase JS client) are loaded via CDN `<script>` tags in `<head>`.

**Data layer — Supabase with a localStorage fallback.** Near the top of the
script, `SUPABASE_URL` / `SUPABASE_ANON_KEY` are hardcoded constants. If they
look like real values (not the `"YOUR_..."` placeholders), `useSupabase` is
true and every read/write goes through `supabaseClient`. Otherwise the app
transparently falls back to `localStorage` (keys `ironlog:entries` and
`ironlog:exercises`). Every load/save function (`loadEntries`, `saveEntries`,
`loadExercises`, `saveExercise`) branches on `useSupabase` and implements both
paths — when changing persistence logic, update both branches. The Supabase
schema (two tables: `workout_entries`, `exercises`) lives in
`supabase/schema.sql`, written to be safely re-runnable (`create table if not
exists`, `drop policy if exists` before `create policy`). If you change the
data model, update that file too and call it out — the user has to manually
re-run it in the Supabase SQL editor; there's no migration tooling and no
service-role key available to run DDL programmatically.

**Exercises are dynamic, not hardcoded.** `DEFAULT_EXERCISES` is the seed
list (the original 13 movements, each tagged with a `muscle` category and
`backbone: true`). At startup `loadExercises()` reads the live roster from
the DB/localStorage, seeding it from `DEFAULT_EXERCISES` if empty, into the
mutable `let EXERCISES` array. Exercises added later via the Exercises tab
default to `backbone: false`. "Backbone" exercises are the pool the Suggested
tab draws recommendations from — this lets users add one-off exercises
without polluting the suggestion algorithm.

**Views are tabs, not pages.** Five top-level views (Log, Progress, Calendar,
Suggested, Exercises) are sibling `<div class="view" id="view...">` elements,
each toggled via the `hidden` attribute by `setView()`. There's no router;
`currentView` is a module-level variable, and each render function
(`renderCharts`, `renderCalendar`, `renderSuggested`, `renderExerciseManage`)
is called both when its tab is switched to *and* from the main `render()`
dispatcher whenever underlying data changes, so the visible tab never goes
stale.

**Progress charts are hand-rolled SVG**, not a charting library —
`drawLineChart()` builds `<path>`/`<circle>`/gridline elements directly,
with a mousemove-driven crosshair + tooltip. Per-exercise color comes from
`colorForExercise()`: the original 13 exercises use a fixed, colorblind-
-validated palette (`EXERCISE_COLORS`); anything added later gets a
deterministic HSL hash color instead. Weighted and reps-only exercises are
charted separately (two charts) since mixing kg and reps on one axis would
be misleading.

**The Suggested tab's algorithm**: `muscleLastTrained()` finds the most
recent log date per muscle group across *all* logged entries (any exercise,
not just backbone ones), ranks muscle groups from most-to-least-recently
trained, then picks the least-recently-trained group that has at least one
*backbone* exercise (skipping groups with zero backbone exercises, e.g. an
empty category) and suggests from that group's backbone exercises, ranked by
their own individual recency.

**Fonts are self-hosted**, not loaded from Google Fonts — `fonts/*.woff2`
(the Gluten typeface, OFL-licensed) with `@font-face` declarations at the top
of the `<style>` block. `Gluten-master/` (the full upstream font source repo,
~10MB) is gitignored and irrelevant to the app; only the 6 weights copied
into `fonts/` are used.

## Conventions specific to this codebase

- Exercise identity is the exercise **name** (a string), used as the primary
  key in the `exercises` table and as the foreign-key-like value on
  `workout_entries.exercise`. There's no separate numeric ID for exercises.
- `entries` (workout sets) use a generated `id` of the form
  `${timestamp}-${random}` — see `logWorkout()`.
- Every mutating flow (log a workout, edit an entry, add an exercise, toggle
  backbone, clear all data) follows the same pattern: mutate the in-memory
  array first, then `await` the persistence call, then re-render. Persistence
  functions alert the user and return `false` on failure rather than
  throwing, so callers generally don't need try/catch of their own.
- CSS custom properties in `:root` (`--plate`, `--steel`, `--paper`, etc.)
  define the palette; `--steel` is a legacy name from an earlier blue theme
  and is now used for the bright-orange secondary accent — don't be misled by
  the name.

## Testing changes

There's no test suite. When verifying a change, use a **copy** of
`index.html` with `SUPABASE_URL`/`SUPABASE_ANON_KEY` reset to the
`"YOUR_..."` placeholders before running it (e.g. via Playwright) — this
forces the localStorage fallback path so test runs never write to the real
Supabase database.
