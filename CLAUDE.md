# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Iron Log — a personal gym workout tracker. Single-user by default, no login.
Almost the entire app (HTML, CSS, JS) lives in one file, `index.html`, as a
vanilla-JS IIFE with no build step and no framework — the one deliberate
exception is `wheel3d.js` (a Three.js module for the muscle-select stage's
3D model), split out because a 3D scene is sizable and self-contained
enough to be clearer on its own; see "The muscle-select stage" below.
There's an optional figurine-grid gate + Supabase Auth for multi-user use —
see "The gate" below; it's off by default (`GATE_ENABLED = false`).

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

**Everything is in `index.html`**, except the 3D model: inline `<style>`
block, then a single `<script>` containing an IIFE with all app logic.
There's no bundler, no npm dependencies. Third-party libraries (jsPDF,
jsPDF-autotable, Supabase JS client, Three.js) are loaded via CDN
`<script>` tags in `<head>` — Three.js via an `importmap` since it's
distributed as ES modules, everything else as classic UMD scripts.
`wheel3d.js` is the one piece of app logic that lives outside `index.html`,
loaded as `<script type="module" src="wheel3d.js">`; it talks to the main
IIFE only through `window.IronLogWheel3D` (see "The muscle-select stage").

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
service-role key available to run DDL programmatically. The optional gate's
schema (per-user scoping, `profiles`, `owner_secret`, `figurine_attempts`)
is a separate, later migration in `supabase/auth_schema.sql` — same
re-runnable convention.

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
(the Karrik typeface, OFL-licensed) with `@font-face` declarations at the top
of the `<style>` block. Karrik only ships Regular and Italic (no bold face),
so both `@font-face` rules declare `font-weight:100 900` — a range, so the
browser treats Regular as valid for any requested weight instead of
synthesizing a faux-bold. `Gluten-master/` and `karrik_fonts-main/` (the full
upstream font source repos) are gitignored and irrelevant to the app; only
the woff2 files actually copied into `fonts/` are used.

**Exercise body diagrams are illustrated PNGs**, not generated shapes —
`images/{chest,back,shoulders,biceps,triceps,core,legs,glutes}.png` (not
`public/images/` — a top-level `public/` folder triggers Vercel's
zero-config "treat public/ as the deploy output directory" behavior on a
framework-less static site, which silently dropped `index.html` from the
deployment the one time this was tried),
each a full-body outline with one region highlighted in an orange/red
gradient. These aren't used anywhere in the app currently (the
muscle-select stage that used to show them is now the 3D model below);
`biceps`/`triceps`/`glutes` in particular were never wired to any
muscle-group entry in `MUSCLES` even before that.

**Logging a workout is a muscle-select stage followed by a classic
block-list form.** The Log tab (`#viewLog`) has two children toggled via
`hidden`: `#muscleSelectStage` (shown by default and every time you
navigate back to the Log tab — see `setView()`) and `#logMainStage` (the
actual logging page, hidden until you pick a muscle group). The
muscle-select stage has a 3D model (`#wheel3dContainer`, driven by
`wheel3d.js`) that spins for feel when dragged — purely decorative, it
does not drive selection — plus a row of plain buttons underneath
(`#musclePickRow`, built by `buildMusclePickRow()`) that actually pick the
muscle group: clicking one calls `confirmMuscleSelection(m)`, which
commits `m` to `logMuscleFilter` and reveals `#logMainStage`. A 2D
spinning-dial picker (drag-to-rotate through 6 muscle images, tap the
centered one to confirm) filled this role before; it's preserved verbatim
in `legacy/muscle-wheel-2d-backup.md` in case the 3D version needs to be
rolled back. `#logMainStage` itself is a plain form: `buildExerciseBlocks()`
renders one `.exercise-block` per visible exercise (name + muscle-colored
left border, no images or icons), each with one or more `.set-row`s
(weight/reps inputs, "+ Add set" next to the exercise name via
`addSetRow()`), and a single "Log workout" button (`logWorkout()`) batches
every filled row across every visible block into one save — nothing is
saved per-keystroke or per-row. `jumpToExercise()` (used by the Suggested
tab) explicitly skips `#muscleSelectStage`, broadens `logMuscleFilter` to
show every exercise, then scrolls to and flashes the target block. The
muscle filter chips above the block list (`buildMuscleFilterRow()`) follow
an isolate/add/toggle-off pattern: from "All", clicking a muscle isolates
it; clicking a different muscle adds it to the selection; re-clicking an
already-active muscle removes it; the "All" chip is the only way to jump
straight back to showing everything.

**The muscle-select stage's 3D model** (`wheel3d.js`, a separate ES module
— see "What this is" above) loads `models/human.3dm` — the raw Rhino
file, no export step — via Three.js's `Rhino3dmLoader` (backed by the
`rhino3dm` WASM decoder, pulled from a CDN at runtime, not vendored),
centers and scales it to a consistent size regardless of the source
model's units/pivot, and spins it in response to drag (with a small idle
auto-spin when left alone) via a `requestAnimationFrame` loop. It exposes
exactly three methods on `window.IronLogWheel3D` — `show(container)`,
`hide()`, `resize()` — so the main IIFE can drive it without being a
module itself: `show()` lazily creates the renderer/scene on first call
and is otherwise idempotent (safe to call every time `enterMuscleGate()`
runs), `hide()` just cancels the animation frame loop (called from
`leaveMuscleGate()`) so it isn't burning battery while off-screen, and
`resize()` is wired into the existing window `resize` listener. If
`models/human.3dm` doesn't exist, `wheel3d.js` renders a placeholder
message instead of a blank canvas. **`models/human.3dm` is ~70MB** — see
`models/README.md` for the size/load-time tradeoff and how to switch to a
much smaller glTF export instead (a small, mechanical loader swap) once
that matters.

**Individual parts of the 3D model are hoverable/clickable**, keyed off
each mesh's `.name` — Rhino3dmLoader carries the Rhino object's own Name
property through, so any SubD/mesh object named (or containing) `chest`,
`back`, `shoulders`, `arms`, `core`, or `legs` gets picked up by
`organizeMuscleGroups()` at load time and reparented (via `Group.attach()`,
which preserves world transform) into a per-muscle `THREE.Group`
positioned at that bucket's own combined bounding-box center — so the
hover effect (`setHighlighted()`: scale up + emissive glow, color from
`MUSCLE_GLOW_COLOR`, a hand-kept-in-sync duplicate of `MUSCLE_COLORS`)
grows each part around its own middle, not the model's origin.
`raycastAt()` drives both true hover (desktop mousemove) and touch (a
raycast seeded at `pointerdown`, since touch has no hover-before-touch);
a release that wasn't a drag on a currently-hovered part dispatches a
`musclepick` CustomEvent on `#wheel3dContainer` (`detail.muscle`), which
`index.html` listens for once in `init()` and forwards straight into
`confirmMuscleSelection()` — same effect as clicking the button row,
which stays wired up as a fallback for parts that don't hover cleanly or
touch devices where precision taps are harder. Naming instructions (and
how to tune `HOVER_SCALE`/`HOVER_EMISSIVE_INTENSITY`/`MUSCLE_GLOW_COLOR`)
are in `models/README.md`. Unnamed or unmatched geometry renders normally
but is inert — this degrades gracefully, so a model with no named parts
at all (as originally dropped in) just isn't interactive yet, not broken.

**The main nav is a hamburger dropdown, not a tab bar.** `#navToggle` (the
three-bar button in the header's corner) toggles an `.open` class on
`#mainTabs` via `toggleNavMenu()`; the panel itself is absolutely
positioned under the button so it doesn't take up layout space when
closed. This is independent of the muscle-gate's `hidden` attribute on
the same element (`enterMuscleGate()`/`leaveMuscleGate()` hide the whole
header, dropdown included, while `hidden` is set) — the `[hidden]` CSS
rule uses `!important` specifically so it always wins regardless of the
dropdown's own `.open` state. `.tabs`/`.tab-btn` are also reused, unscoped,
by the gate's sign-in/sign-up toggle (`#strangerSignInTab`/
`#strangerSignUpTab`), so anything dropdown-specific is scoped to
`#mainTabs` rather than the bare classes.

**The header's subtitle is the "curiosity" fun fact, not a static
tagline.** `renderFunFact()` writes directly into `header.top .sub`
(`id="funFact"`) — there's no separate boxed fun-fact element anymore.
The comparisons it picks from (`data/comparisons.txt`, `label|weight_in_kg`
per line) are the user-editable "stats surpassed" file — thresholds and
labels can be edited freely and take effect on next load with no code
changes, since `loadComparisons()` just re-parses the file and
`renderFunFact()` filters by `stats.totalVolume >= c.kg`.

**The gate** (`GATE_ENABLED`, off by default): when on, `bootstrap()` (not
`init()`) is the `DOMContentLoaded` entry point. It shows `#gateScreen` — a
20×20 grid of decorative figurine buttons — until either the
`ironlog:ownerUnlocked` localStorage flag or an active Supabase Auth session
is present, then hides the gate and calls `init()`. Clicking a cell posts to
the `verify-figurine` Edge Function (`supabase/functions/verify-figurine/`),
which is the *only* thing that ever sees the correct cell (a service-role
query against `owner_secret`, a table with no anon/authenticated RLS policies
at all). Rate limiting is enforced server-side too, via `figurine_attempts`,
not just the client's 5s cooldown timer. "I'm a stranger" is a normal
Supabase Auth email/password flow; every row in `workout_entries`/
`exercises` now carries a `user_id` — the owner's is a fixed sentinel UUID
(`OWNER_SENTINEL_ID`), not `NULL`, because Postgres primary/unique keys can't
contain NULL and `exercises` is keyed on `(user_id, name)` so two users can
both have a "Bench". **This gates the page, not the data** — the owner's
rows are still reachable by anyone holding the public anon key, exactly as
before; see the README's "Optional: figurine-grid login" section before
assuming it protects anything sensitive.

## Conventions specific to this codebase

- Exercise identity is the exercise **name** (a string), used (together with
  `user_id`) as the primary key in the `exercises` table and as the
  foreign-key-like value on `workout_entries.exercise`. There's no separate
  numeric ID for exercises. Renaming (`renameExercise()`) updates both the
  `exercises` row and every `workout_entries` row referencing the old name,
  since there's no DB foreign key tying them together.
- `entries` (workout sets) use a generated `id` of the form
  `${timestamp}-${random}` — see `logWorkout()` and `saveEditedGroup()`.
- Every mutating flow (log a workout, edit a group of sets, add an exercise,
  toggle backbone, clear all data) follows the same pattern: mutate the
  in-memory array first, then `await` the persistence call, then re-render.
  Persistence functions alert the user and return `false` on failure rather
  than throwing, so callers generally don't need try/catch of their own.
- CSS custom properties in `:root` (`--plate`, `--steel`, `--paper`, etc.)
  define the palette; `--steel` is a legacy name (blue, then orange) and is
  now the mint-green half of the brand pair (red `--plate` #cc382a / mint
  `--steel` #3fa876, everything else black/white/gray) — don't be misled by
  the name. `MUSCLE_COLORS` and `FIGURINE_COLORS` are deliberate exceptions
  to that palette: muscle categories need 6 mutually distinguishable colors
  (a validated categorical set from the dataviz work), which red+mint alone
  can't provide, and the figurine grid's colors are its own derivative set.

## Testing changes

There's no test suite. When verifying a change, use a **copy** of
`index.html` with `SUPABASE_URL`/`SUPABASE_ANON_KEY` reset to the
`"YOUR_..."` placeholders before running it (e.g. via Playwright) — this
forces the localStorage fallback path so test runs never write to the real
Supabase database.
