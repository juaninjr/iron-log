# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Iron Log — also branded/known as **Knife** (kknniiffee.com) in the app's
own UI (the wordmark, PDF/backup filenames, etc. all say "Knife"; "Iron
Log" is this repo's/project's name, not what users see) — a personal gym
workout tracker. Single-user by default, no login.
Vanilla JS split across ES modules in `src/`, built with Vite — no
framework (no React/Vue/etc.), but a real build step (`npm run build`) and
real npm dependencies, not the single-inline-`<script>`-tag setup this
project used before. `index.html` is markup only now; every module in
`src/` does one thing (persistence, one tab's UI, the 3D model, …) and
imports what it needs from the others — see "Module map" below before
making changes, so new code lands in the right file rather than growing
whichever file you happened to open first. There's an optional
figurine-grid gate + Supabase Auth for multi-user use — see "The gate"
below; `GATE_ENABLED` (`state.js`) currently defaults to `true` in this
repo, for local/dev use. **Remind the user to flip it back to `false`
before any deploy to the public internet** — ask this any time they say
they want to deploy/ship/push live, don't wait to be asked.

## Commands

```bash
npm install       # first time only
npm run dev       # dev server with hot reload, at the printed localhost URL
npm run build     # production build, output in dist/
npm run preview   # serve the dist/ build locally, to sanity-check a build
```

There's no lint or test tooling. Verify changes by running the app in a
browser (or headless via Playwright) and exercising the affected flow —
see "Testing changes" below. Vercel auto-detects this as a Vite project
(via `package.json` + `vite.config.js`) and runs `npm run build` /  serves
`dist/` — no `vercel.json` needed.

## Module map

```
index.html            markup only — no inline <style> or <script> logic
src/
  main.js              entry point: imports style.css + wheel3d.js (side
                        effect), wires every event listener, defines and
                        exports init(), calls bootstrap() on DOMContentLoaded
  state.js              the shared `state` object + static constants
                        (PROFILES/activeProfile(), DEFAULT_EXERCISES,
                        DIANA_DEFAULT_EXERCISES, Supabase config,
                        GATE_ENABLED, VIEW_IDS, …) — see "The state
                        object" and "Profiles: the owner and Diana"
                        below before touching any mutable app data
  dom-utils.js           $, $all, clamp, todayISO, fmtDate, fmtDateShort,
                        cssEscape, exerciseSort, triggerHaptic, showToast
  persistence.js        Supabase ⇄ localStorage load/save/delete for
                        entries + exercises + the Today's Workout plan
                        (see "Data layer" below), plus currentUserId()/
                        currentUserLabel()
  nav.js                 toggleNavMenu, toggleStatsDropdown, setView — the
                        hamburger dropdown, the header's stats dropdown,
                        and cross-tab view switching (including each
                        view's header title, see "Header title" below)
  brand.js               the "Knife" wordmark (ghost-vibrate title) and
                        an SVG knife-glyph fallback — see "Brand: Knife"
                        below. Only used by gate.js now (the gate/login
                        screen) — no subpage shows it, see "Header title".
  log-tab.js             the muscle-select stage, the exercise pickers
                        (wheel-scoped and the main page's own unfiltered
                        list), the Today's Workout page's exercise blocks,
                        logWorkout, grouped-row editing, the nav dropdown's
                        exercise browser (buildLogNavBrowser), and
                        render() (the central re-render dispatcher — see
                        below)
  progress-tab.js        the hand-rolled SVG charts
  calendar-tab.js         the calendar grid
  suggested-tab.js        Suggested-tab ranking + jumpToExercise
  exercises-tab.js        add/rename/delete/toggle-backbone exercise
                        management
  feedback-tab.js         the Feedback tab — one write-only insert into
                        the `feedback` table, no read path at all
  export.js              PDF export, JSON backup export/import, clear-all
  gate.js                 figurine grid (the real knife logo PNG) +
                        Diana's Q&A gate step + stranger auth +
                        bootstrap() + the Developer Tools page's Diana-gate
                        toggle (renderDevToolsView())
  wheel3d.js              the 3D muscle-select model (Three.js) — see
                        "The muscle-select stage's 3D model" below
public/                 static assets served as-is at the site root —
                        fonts/, images/, data/comparisons.txt, models/*
```

`src/fun-fact.js` (the old dynamic "curiosity" subtitle — see git history)
was removed during the Knife rebrand; the header/gate subtitle is now a
static tagline (`.knife-desc`, from `brand.js`'s callers). Nothing reads
`public/data/comparisons.txt` anymore — it's left on disk since it's
user-edited content, not code, but it's dead weight until/unless that
feature comes back.

Two directories share the name "models" for different reasons: repo-root
`models/README.md` is documentation (not deployed); `public/models/*.glb`/
`*.3dm` are the actual runtime-loaded assets.

## The `state` object

There's no framework, so there's no built-in mechanism for one module to
observe another module's `let` reassignment — ES modules only give you a
*live read* of another module's exported bindings, not permission to
reassign them from outside. Rather than invent getter/setter functions
for a dozen pieces of state, every mutable piece of app data (entries,
EXERCISES, currentView, todayPlan, editingGroupKey, …) lives as a
property on one exported object, `state`, from `state.js`. Any module
does `state.entries.push(x)` or `state.currentView = "log"` directly — no
setters needed, since you're mutating the object's properties, never
reassigning the `state` binding itself. When adding new mutable app data,
put it on `state`, not as a bare module-level `let`.

**Circular imports are intentional in several places** (e.g. `log-tab.js`
imports render functions from `progress-tab.js`/`calendar-tab.js`/
`suggested-tab.js` for `render()`'s cross-tab dispatch, while
`suggested-tab.js` imports back from `log-tab.js` for `addToTodayPlan()`/
`showTodayWorkoutPage()`; `log-tab.js` also imports `toggleNavMenu` from
`nav.js` for the dropdown's exercise browser, while `nav.js` imports back
from `log-tab.js` for `setHeaderTitle()`/`enterMuscleGate()` and from
`gate.js` for `renderDevToolsView()`, while `gate.js` imports back from
`log-tab.js` for `resetProfileFilters()`). This is safe here because
every circular reference is only ever *used* inside a function body
(called later, after both modules have finished loading), never read at
module-evaluation time — if you introduce a new cross-module call, keep
it inside a function, not at the top level of the file, or the circular
import will break.

## Profiles: the owner and Diana

The app supports exactly two **fixed, named** profiles — the owner and
Diana — both unlocked via the same figurine grid (not the "I'm a
stranger" Supabase Auth flow, which is a third, open-ended identity path;
see "The gate" below). Everything that differs per profile (muscle
categories, colors, seed/backbone exercises, how the 3D model's named
layers map onto those categories) lives in `PROFILES` (`state.js`), keyed
`"owner"`/`"diana"`; `state.activeProfile` (default `"owner"`) picks which
one, and `activeProfile()` returns that entry. It's set exactly once, at
gate-unlock time (`gate.js`'s `enterApp(profile)` and the two return-visit
branches in `bootstrap()`), before `init()` ever renders anything — a
browser session is gated into one profile for its duration, so nothing
needs to react to `state.activeProfile` changing mid-session.

**Functional changes default to every profile.** Anything that changes
how the app *works* — a new exercise type (Cardio), a new tab, a new
picker, a new interaction pattern — ships for both the owner and Diana by
default; profile-specific content (her own muscle categories, her own
seed exercises, her own colors, her own 3D model) is the exception that
already existed for a reason, not the template for new features. The only
things that stay owner-only are genuinely **admin/dev-tool** surfaces —
Diana's own gate toggle (Developer Tools, below) and anything like it —
because the owner is the one operating the app on Diana's behalf for
those, not because a feature "belongs" to one profile more than the
other. When in doubt, extend `PROFILES.diana` (or wherever the owner-only
version lives) rather than leaving Diana without something the owner
just got.

Every module that used to read the owner's flat `MUSCLES`/`MUSCLE_LABELS`/
`MUSCLE_COLORS` constants (`log-tab.js`, `progress-tab.js`,
`suggested-tab.js`, `exercises-tab.js`, `dom-utils.js`'s `exerciseSort()`)
now reads `activeProfile().muscles`/`.muscleLabels`/`.muscleColors`
instead — this is the entire mechanism behind "each profile gets its own
charts/Suggested ranking/exercise list": those functions already looped
over "the muscle list" and "the color map," so pointing that at the active
profile's own values was the whole change, no chart-specific code. Three
Set-valued pieces of `state` (`weightFilterSelected`, `repsFilterSelected`,
`logMuscleFilter`) are built once at module-load time off the owner's
list (no profile is chosen yet at that point) — `resetProfileFilters()`
(`log-tab.js`) rebuilds them off `activeProfile().muscles` and must be
called any time `state.activeProfile` changes; every real call site
(`enterApp()`, both `bootstrap()` unlock branches) already does this — if
you add a new one, call it too.

**Each profile has its own 3D model now** — `modelGlb`/`modelRhino`
(`PROFILES`, `state.js`) point `wheel3d.js` at the right pair of files:
the owner's `public/models/muscle-select.glb`/`human.3dm`, Diana's
`public/models/diana-muscle-select.glb`/`diana-human.3dm` (from
`models/female.glb`/`female_human.3dm` — the repo-root `models/` folder,
documentation/staging only, is where dropped-in source files land before
being copied into `public/models/` under their real runtime names). **Only
Diana's `.glb` is actually committed** — her `.3dm` is ~101MB, just over
GitHub's 100MB-per-file push limit (a real rejected push, not a
theoretical concern — see `models/README.md`), so it exists locally but
isn't in the deployed build; her `.glb` (the fast path, and what actually
loads in practice) is unaffected. `ensureScene()`/`loadRhino()` read
`activeProfile().modelGlb`/`.modelRhino` instead of a flat constant; safe
to read once, since the scene is only ever built once per page load
(`if(renderer) return;`) and
the active profile is already fixed for the session by then.

**Each profile's `modelLayerAliases` (`state.js`) maps its *own* muscle
keys onto its *own* model's actual layer-name substrings** — for the
owner this is the identity mapping (chest/back/shoulders/arms/core/legs
are literally the model's own Rhino layer names). Diana's model has real
`Core`/`Legs`/`Glutes`/`Upper Body` layers (confirmed by parsing
`female.glb`'s glTF JSON chunk directly — no Rhino needed, it's an open,
inspectable format), so `modelLayerAliases: { upper: ["upper body"],
glutes: ["glutes"], legs: ["legs"], core: ["core"] }` — all four of her
categories have real 3D geometry, including glutes, which the earlier
shared-model version deliberately couldn't offer. (An earlier export of
her model didn't have a dedicated upper-body layer — everything not
assigned a real layer landed on Rhino's fallback "Layer 01," which
happened to be her whole unsplit upper body, so the map briefly read
`upper: ["layer 01"]` — the artist re-exported with a proper "Upper Body"
layer, and "Layer 01" now likely just holds the head, left unmatched.)

**A real bug shipped with that "Upper Body" layer, since fixed**:
`organizeMuscleGroups()`'s matching (`keyForName()`, `wheel3d.js`) is a
plain substring check against each ancestor node's lowercased `.name`,
but Three.js's `GLTFLoader` sanitizes multi-word node names at load
time — Rhino's "Upper Body" layer (confirmed via the raw glTF JSON: the
source file's own `name` field really does say `"Upper Body"`, with a
space) comes through at *runtime* as `"Upper_Body"`, an underscore in
place of the space. `"upper_body".includes("upper body")` is false, so
every one of that layer's ~4780 mesh fragments silently fell through as
unmatched — the button-row hover for "Upper Body" lit up (button-side
hover doesn't need a matched 3D group to work), but the model itself
never glowed, which is what actually surfaced this: found by directly
raycast-hovering the model (worked — but turned out to be hitting the
*Core* region, not Upper Body, a red herring at first) versus calling
`window.IronLogWheel3D.hoverMuscle('upper')` on a fresh load (didn't glow
anything at all), then confirmed by a one-off `console.log` of each
match bucket's size inside `organizeMuscleGroups()` in a throwaway copy
(`upper: 0`, `unmatched: 4781`) and of one unmatched mesh's actual
ancestor-name chain, which read `"Upper_Body"` where the static file said
`"Upper Body"`. Every other layer name in both models (Core, Legs,
Glutes, chest, back, shoulders, arms) is a single word, so this never
came up before Diana's first two-word layer. `keyForName()` now
normalizes by replacing underscores with spaces before matching, so
`modelLayerAliases` can keep being written the readable way (`"upper
body"`) regardless of how any future multi-word layer name gets
sanitized at load time.

`wheel3d.js`'s `organizeMuscleGroups()` reads this map instead of a flat
key list, so it had to start importing `state.js` (it deliberately didn't
before — not worth plumbing for 6 static hex codes — but that stopped
being true once there were two real, differently-shaped profiles).

**Each profile also has its own `modelGltfRotateXDeg`** (`state.js`), the
one-time Z-up→Y-up correction Rhino's glTF exporter needs (see
`models/README.md`'s "Sizing / orientation / material quirks" for the
full story) — no longer a single flat constant in `wheel3d.js`, since the
two profiles' exports needed different values: the owner's is 90°;
Diana's own export needed 180° — 90° alone left her lying on her back
looking up rather than standing upright, both well-formed poses, just the
wrong one. Confirmed by live-testing rotation values with the model's
centering recomputed at each candidate (naively changing rotation without
recentering leaves the old centering stale and makes every value except
the original look broken/cropped, which is misleading if you don't
recenter before judging the result).

**Diana's page has a second factor the owner's doesn't**: after her
figurine cell is verified (see "The gate" below), a security-question
challenge from a small dictionary (`diana_qa`, DB-only, seeded with
placeholders — see `supabase/diana_schema.sql`) — one random question per
attempt, answer checked server-side (trimmed, case-insensitive) by the
`diana-qa` Edge Function, rate-limited the same way the grid is. Whether
this step runs at all is a single boolean the owner controls from their
own session — `diana_gate_settings.gate_enabled`, read/written directly
by the anon-key client (`loadDianaGateSetting()`/`setDianaGateSetting()`,
`gate.js`) since the owner has no real Supabase Auth account to gate a
write behind — surfaced on the **Developer Tools page** (`renderDevToolsView()`,
`gate.js`, re-rendered fresh every visit like `renderExerciseManage()`,
not wired once), not a header button anymore — see "Developer Tools"
below.

## Architecture

**Data layer — Supabase with a localStorage fallback.** In `state.js`,
`SUPABASE_URL` / `SUPABASE_ANON_KEY` are hardcoded constants (Supabase's
JS client is a real npm dependency, `@supabase/supabase-js`, imported via
`createClient()` — not a CDN script anymore). If they look like real
values (not the `"YOUR_..."` placeholders), `useSupabase` is true and
every read/write goes through `supabaseClient`. Otherwise the app
transparently falls back to `localStorage` (keys `ironlog:entries` and
`ironlog:exercises`). Every load/save function in `persistence.js`
(`loadEntries`, `saveEntries`, `loadExercises`, `saveExercise`) branches
on `useSupabase` and implements both paths — when changing persistence
logic, update both branches, **and every Supabase query must filter by
`.eq("user_id", currentUserId())`** — see `persistence.js`'s own header
comment for why (RLS alone can't isolate the owner from Diana, since they
share one public anon key); this exact class of bug shipped for real once
already (`loadEntries`/`loadExercises`/`renameExercise` all missed it) and
showed up as one profile's exercises appearing under the other. The
Supabase schema (two tables:
`workout_entries`, `exercises`) lives in `supabase/schema.sql`, written to
be safely re-runnable (`create table if not exists`, `drop policy if
exists` before `create policy`). If you change the data model, update
that file too and call it out — the user has to manually re-run it in the
Supabase SQL editor; there's no migration tooling and no service-role key
available to run DDL programmatically. The optional gate's schema
(per-user scoping, `profiles`, `owner_secret`, `figurine_attempts`) is a
separate, later migration in `supabase/auth_schema.sql`; Diana's profile
(a third migration, `supabase/diana_schema.sql`) is a later one still —
see "Profiles: the owner and Diana" below. All three follow the same
re-runnable convention.

**Exercises are dynamic, not hardcoded — and per-profile.**
`activeProfile().defaultExercises` (`state.js` — `DEFAULT_EXERCISES` for
the owner, `DIANA_DEFAULT_EXERCISES` for Diana) is the seed list for
whichever profile is logged in. At startup `loadExercises()`
(`persistence.js`) reads the live roster from the DB/localStorage,
seeding it from that list if empty, into `state.EXERCISES`. Exercises
added later via the Exercises tab default to `backbone: false`.
"Backbone" exercises are the pool the Suggested tab draws recommendations
from — this lets users add one-off exercises without polluting the
suggestion algorithm. **A whole new muscle category added after a roster
already exists needs its own backfill, not just a `defaultExercises`
edit** — the "seed if empty" check above only ever fires for a roster
that's *entirely* empty, so an existing user with existing exercises
never gets newly-added defaults just by pulling a new build. This bit
Cardio for real: it was added to `DEFAULT_EXERCISES`/
`DIANA_DEFAULT_EXERCISES` in an earlier session, but any roster that
already existed by then still had zero cardio exercises, and clicking
Cardio on the wheel just read "No cardio exercises yet." `loadExercises()`
now also checks, after either branch's own load/seed logic, whether
`state.EXERCISES` has *any* `muscle === "cardio"` entry at all; if not, it
adds whichever of that profile's default cardio exercises aren't already
present by name (so a manually-added/renamed cardio exercise is left
alone) and persists each via `saveExercise()`. This one-time top-up
pattern is specific to Cardio's own rollout, not a generic mechanism —
don't assume future muscle-category additions get it automatically
without adding the same kind of check.

**Exercises are one of three types, not two**: weighted (has `min`/`max`/
`step`), reps-only (`repsOnly: true`), or — a "Cardio" muscle category, on
**every** profile (see "Functional changes default to every profile"
below) — `cardio: true`, logging distance (km) + time (minutes) instead of
weight/reps, added via a `Cardio (distance + time)` checkbox in the
Exercises tab's add form (`exercises-tab.js`, mutually exclusive with "Per
hand"/"Track weight" — `wireCardioCheckbox()` disables those two while
it's checked; `populateMuscleSelect()`'s muscle-group `<select>` was
already profile-generic, so Diana getting her own "Cardio" option needed
no change there). Every place that already branched on `ex.repsOnly`
(`addSetRow()`/`buildGroupEditRow()`'s inputs, `logWorkout()`/
`saveEditedGroup()`'s per-row read logic, `renderSetsCell()`/
`formatSetsText()`'s display) gained a third `ex.cardio` branch alongside
it — entries carry two new nullable fields, `distance`/`duration`,
parallel to `weight`/`reps` (`supabase/cardio_schema.sql`, a migration the
user needs to run — it also widens `exercises.muscle`'s check constraint
the same way `diana_schema.sql` did for Diana's categories, and adds the
`cardio` column to `exercises`). Deliberately **not** added to
`progress-tab.js`'s charts (cardio entries have `weight === null` and
`repsOnly === false`, so both existing weight/reps charts already exclude
them automatically — no crash, just not graphed; a distance/time chart
type wasn't asked for) or to `calendar-tab.js`/`suggested-tab.js` (both
already exercise-shape-agnostic — Cardio's own backbone exercises get
ranked/suggested exactly like any other muscle group with no code change
needed).

**Cardio gets its own row on the wheel, and its own picker.** It isn't a
body region the 3D model has geometry for, so lumping it into the
muscle-group button row (`#musclePickRow`) implied a hover it could never
deliver — `buildMusclePickRow()` (`log-tab.js`) now routes the "cardio"
entry of `activeProfile().muscles` into a second, separate container
(`#cardioPickRow`) instead, same button markup, just visually its own row
underneath. Tapping it opens the same `#quickLogStage` as any other
muscle, but `confirmMuscleSelection()`/`rebuildCurrentPicker()` branch on
`m === "cardio"` to render `buildCardioPicker()` there instead of
`buildPickerList()`'s one-button-per-exercise list — a single "what type"
`<select>` (Run, Row, Swim, any others added later) plus one Add/Added ✓ toggle
that tracks whichever option is currently selected. Metrics themselves
are unchanged: still entered later as distance (km) + time (min) on the
Today's Workout page, same as before this existed — the dropdown only
changes *which cardio exercise* gets added to the plan, not how it's
logged.

**Deleting an exercise (any profile) is a backup-then-cascade-delete, and
gated by whether it has any history.** Each row in the Exercises tab's
"All exercises" list has a 🗑 button (`exercises-tab.js`) wired to
`deleteExerciseFlow(ex)`. If the exercise has zero logged sets, it's a
plain `confirm()` and an immediate delete. If it has any, deleting it also
deletes every one of those logged sets — there's no "orphaned entries"
state, an entry referencing an exercise that no longer exists would just
be dead weight everywhere entries are read — so the flow first asks for
the 6-digit code in `EXERCISE_DELETE_PIN` (`state.js`) via `prompt()`,
same category as `export.js`'s `clearAllData()` "type DELETE to confirm"
— a typed-confirmation friction gate, not a real access-control boundary,
since whoever's on this screen already got past the app's own gate.
Change the constant directly in code for a different code.

Either way, **the exercise and its entries are backed up before either is
touched** — `backupExerciseDeletion(ex, entries)` (`persistence.js`)
writes one row to `deleted_exercise_backups` (`supabase/
exercise_backups_schema.sql`, or its localStorage-fallback array,
`EXERCISE_BACKUPS_STORAGE_KEY`) containing the full exercise definition
and every one of its entries as JSON, and the delete only proceeds if
that write succeeds — a failed backup always means nothing was deleted,
never the reverse. There's no restore UI; recovering from a backup means
reading it out of that table (or localStorage array) by hand and
re-inserting into `exercises`/`workout_entries`.

**Views are tabs, not pages.** Five top-level views (Log, Progress,
Calendar, Suggested, Exercises) are sibling `<div class="view"
id="view...">` elements, each toggled via the `hidden` attribute by
`setView()` (`nav.js`). There's no router; `state.currentView` tracks the
active one, and each tab's render function (`renderCharts`,
`renderCalendar`, `renderSuggested`, `renderExerciseManage`) is called
both when its tab is switched to *and* from `render()`'s (`log-tab.js`)
cross-tab dispatch whenever underlying data changes, so the visible tab
never goes stale.

**Progress charts are hand-rolled SVG** (`progress-tab.js`), not a
charting library — `drawLineChart()` builds `<path>`/`<circle>`/gridline
elements directly, with a mousemove-driven crosshair + tooltip. Colors
come from `activeProfile().muscleColors` (`state.js`, one fixed color per
muscle group, per profile — see "Profiles" above and "Conventions"
below). Weighted and reps-only exercises are charted separately (two
charts) since mixing kg and reps on one axis would be misleading.

**The Suggested tab's algorithm** (`suggested-tab.js`):
`muscleLastTrained()` finds the most recent log date per muscle group
across *all* logged entries (any exercise, not just backbone ones), ranks
muscle groups from most-to-least-recently trained, then picks the
least-recently-trained group that has at least one *backbone* exercise
(skipping groups with zero backbone exercises, e.g. an empty category)
and suggests from that group's backbone exercises, ranked by their own
individual recency.

**Fonts are self-hosted**, not loaded from Google Fonts —
`public/fonts/*.woff2`, referenced by absolute `/fonts/...` paths in
`@font-face` declarations at the top of `src/style.css`. The app-wide
typeface is Geist Sans (`GeistSans-Variable.woff2`/`GeistSans-Italic-
Variable.woff2`, pulled once from the `geist` npm package's
`dist/fonts/geist-sans/` and not kept as a runtime dependency — same
convention as Karrik's source repos being gitignored below), applied via
`--font-sans` on `:root` and `font-family:var(--font-sans)` on `body`.
Karrik's woff2 files (`Karrik-Regular.woff2`/`Karrik-Italic.woff2`,
OFL-licensed) still sit in `public/fonts/` from an earlier design but
aren't referenced by any `@font-face`/`font-family` in the current
`style.css` — they're inert, not a second typeface actually rendering
anywhere; don't assume otherwise without checking. Geist Sans's variable
files declare `font-weight:100 900` — a range, so the browser treats the
one file as valid for any requested weight instead of synthesizing a
faux-weight. `Gluten-master/` and `karrik_fonts-main/` (the full upstream
font source repos) are gitignored and irrelevant to the app; only the
woff2 files actually copied into `public/fonts/` are used. `fonts/OFL.txt`
(Karrik's license text) stays at the repo root, not in `public/` — it's
documentation, not a runtime asset. Geist Sans's own OFL license is
bundled inside the `geist` npm package, not copied into this repo.

Geist Sans's two `@font-face` families are named `__GeistSans_fb8f2c` and
`__GeistSans_Fallback_fb8f2c` — not arbitrary, but chosen to exactly match
the literal font-family names Next.js's `next/font` generates on the
sibling site, ffoorrkk.com/kknniiffee.com's other properties: a real
`@font-face` plus a metrics-adjusted fallback face. This project has no
Next.js, so both are declared by hand in `src/style.css` — the fallback
face is a plain `local('Arial')`, not a true metrics-adjusted match (no
`next/font`-equivalent tooling here to compute one), close enough that a
brief pre-load flash doesn't visibly reflow.

**Exercise body diagrams are illustrated PNGs**, not generated shapes —
`public/images/{chest,back,shoulders,biceps,triceps,core,legs,glutes}.png`,
each a full-body outline with one region highlighted in an orange/red
gradient. These aren't used anywhere in the app currently (the
muscle-select stage that used to show them is now the 3D model below);
`biceps`/`triceps` in particular were never wired to any muscle-group
entry in the owner's category list even before that; `glutes` now is one
of Diana's own categories (see "Profiles" above), just not backed by this
PNG.

**Logging a workout is a plan-then-log flow, not one page**: pick
exercises first (no inputs required), then log sets for whatever you
picked, on one page that still shows the full exercise roster (this
matches the app's original single-full-page design — a first version of
this flow split picking into its own separate all-exercises stage, but
that stage was removed as redundant once picking moved directly onto
`#logMainStage` itself). All three stages below are siblings inside
`#viewLog` (`log-tab.js`), only one visible at a time via `hidden`.

`#muscleSelectStage` (the wheel — shown by default and every time you
navigate back to the Log tab, see `setView()`) has a 3D model
(`#wheel3dContainer`, driven by `wheel3d.js`) that spins for feel when
dragged and highlights individual parts on hover/tap — see "The
muscle-select stage's 3D model" below — plus a row of plain buttons
underneath (`#musclePickRow`, built by `buildMusclePickRow()`) that also
pick the muscle group as a fallback, and hover each other two-way with
the 3D model (see below). A 2D spinning-dial picker (drag-to-rotate
through 6 muscle images, tap the centered one to confirm, no 3D model at
all) filled the wheel's role before the 3D model existed; its code
(written for the pre-Vite single-`index.html` layout, so the paste-back
instructions are stale, but the logic itself is still valid) is preserved
in `legacy/muscle-wheel-2d-backup.md` in case it's ever needed again. The
house/knives-hover icon above the model, labeled "Create Plan"
(`#skipToLogBtn` → `showTodayWorkoutPage()`), jumps straight to
`#logMainStage` — the "old logic" full page, which already lists every
exercise (see below), so there's no separate unfiltered-picker stage to
land on anymore.

Clicking a muscle instead (button row, or tapping a recognized 3D part)
calls `confirmMuscleSelection(m)`, which opens a *scoped* picker
(`#quickLogStage`) — a quick shortcut limited to just that one muscle's
exercises, not the only way to reach everything else. It renders one
plain add/remove button per exercise via `buildPickerList(containerSel,
exercises)` — no weight/reps inputs here — that toggles the exercise's
membership in `state.todayPlan` (see "Today's Workout plan" below) via
`addToTodayPlan()`/`removeFromTodayPlan()`; an already-added exercise
reads "Added ✓" and re-clicking it removes it. Both `#quickLogStage`'s
"Train more" button (`#trainMorePickerBtn`) and its small back icon
(`#quickLogBackBtn`) call `showTodayWorkoutPage()` — "Train more"
deliberately does *not* return to the wheel (an earlier version did; the
user found spinning the wheel again, just to add one more exercise from a
different muscle, tedious when the full list was one tap away on the main
page anyway).

`#logMainStage` — now titled "Today's Workout" (see "Header title" below,
not "Log a workout") — has two parts, top to bottom:
1. **The gray "Today's Workout" box** (`#todayWorkoutBox`, `.today-workout-box`
   in `style.css`) — sits where stats used to before they moved to the
   header (see "Header stats dropdown" below), one `.exercise-block`
   (real weight/reps inputs, same as always) per exercise currently in
   `state.todayPlan`, via `buildExerciseBlocks()`, plus the date input and
   `#logWorkoutBtn` (sized to its own label via a `width:auto` override in
   `style.css` — `.primary-btn`'s shared `width:100%` default is right for
   a lone form submit button elsewhere, but stretched across the whole box
   it read as an oversized empty bar). Adding an exercise here needs no reps/weight up
   front — it just appears as an empty block, ready to fill in whenever.
   `logWorkout()` batches every filled row into one save, same as
   before — it and `buildExerciseBlocks()` dropped the old `containerSel`
   parameter, since exercise blocks only ever render into `#exerciseBlocks`
   now (the picker renders `.plan-pick-item`s instead, a different, input-
   less markup — see above). **Logging a set removes that exercise from
   the plan** (and so from the page) — once `logWorkout()` has actually
   saved at least one set for it this round, its block has done its job;
   an exercise whose block was left empty (skipped this round) stays put
   for later, since only names that actually appear in the batch of new
   entries (`newEntries`, keyed by `ex.name`) get filtered out of
   `state.todayPlan`. There's deliberately no scroll/snap afterward — the
   page just re-renders in place with whatever's left, plus a `.toast`
   bubble (`#logToast`, `showToast()`, `dom-utils.js`) reading "Logged N
   sets correctly!" that fades on its own; each block still also has a
   small "×" remove button for taking an exercise out of the plan
   pre-emptively, independent of logging it.
2. **"All exercises"** (`#allExercisesList`, `buildAllExercisesList()`) —
   every exercise, same `buildPickerList()` renderer and Add/Added ✓
   toggle buttons as the wheel's scoped picker (just called with
   `state.EXERCISES` unfiltered instead of one muscle's subset) — this is
   what makes `#logMainStage` itself the "old logic" full list again, and
   what "Create Plan"/"Train more"/the picker's back icon all now lead to
   rather than a separate stage.

`jumpToExercise()` (`suggested-tab.js`) adds its target to the plan first
(`addToTodayPlan()`, if not already there) before calling
`showTodayWorkoutPage()` and flashing the block, since the gray box only
ever shows plan exercises (the "All exercises" list further down would
still have the target too, just not scrolled-to/flashed). The nav
dropdown's exercise browser (below) calls the same function.

**The Today's Workout plan** (`state.todayPlan`, an array of exercise
names — same name-as-identity convention `entries.exercise` already
uses — plus `state.todayPlanDate`) is what the pickers write to and
`#logMainStage` reads from. `persistence.js`'s `loadTodayPlan()`/
`saveTodayPlan()` persist it per profile (`today_plans` table,
`supabase/today_plan_schema.sql` — a new migration the user needs to run,
same as every other schema file; the localStorage fallback uses
`profileScopedKey(TODAY_PLAN_STORAGE_KEY)`, same per-profile scoping as
entries/exercises). It resets daily by content, not by a cron job:
`loadTodayPlan()` compares the stored `plan_date`/`planDate` against
`todayISO()` and treats a non-matching (i.e. stale) plan as empty in
memory, without writing anything back until the next actual add — so an
idle reload on a new day costs zero writes. `addToTodayPlan()`/
`removeFromTodayPlan()` follow the same "mutate state, await persistence,
re-render" pattern as everything else in `log-tab.js`.

**Header title**: `setHeaderTitle(title)` (`log-tab.js`) fills
`#headerLogoSlot` with a plain `.page-title--brand` span reading `title`,
or clears it entirely when `title` is `null` — no subpage shows the
"Knife" wordmark or its "A training log platform" tagline anymore; that's
the gate/login screen's own brand moment (`gate.js`'s `bootstrap()`,
via `renderKnifeTitle()`, `brand.js` — the only remaining caller), not
something repeated on every page. `null` is used whenever a page's own
content already carries an equivalent heading right below the header, so
a title there would just repeat it — Today's Workout (the gray box's own
`<h2>`), Calendar ("Training calendar"), and Suggested ("Suggested for
you") all pass `null`; Progress, Exercises, Feedback, and Developer Tools
show their own plain name since nothing on those pages already says it.
`nav.js`'s `VIEW_TITLES` map is the single place this is decided per
view, read by `setView()`; `showTodayWorkoutPage()` (`log-tab.js`) is the
Log tab's own special case, since reaching it doesn't go through
`setView()`.

**The nav dropdown** (`#mainTabs`, `nav.js`'s `toggleNavMenu()`) holds,
top to bottom: **Log** (a small hand-rolled person-icon glyph + a native
`<details><summary>Browse exercises</summary>…</details>` right
underneath it — tap-to-expand, no custom open/close JS, works
identically on touch and desktop), **Progress**, **Calendar**,
**Suggested**, then a visually secondary group below a thin divider
(`.nav-minor-group` in `index.html`/`style.css`) — **Feedback**,
**Developer Tools** (owner-only, see below), and **Log out** (this last
one used to sit in the header next to the hamburger as its own button;
it's just another dropdown row now). That group's three buttons carry an
extra `.nav-tab-minor` class on top of `.tab-btn` — same click wiring and
`data-view` handling as every other row (`$all(".tab-btn", ...)` in
`main.js` still picks them all up), just styled with no box (transparent,
no border), smaller, and not bold/uppercase, since they're not peer
navigation destinations the way Log/Progress/Calendar/Suggested are.
There's no standalone **Exercises** row anymore — managing exercises
(add/rename/delete/backbone toggle) is really an extension of browsing
the roster, not a fifth peer of Progress/Calendar/etc., so it's reachable
via a small "+" (`.nav-add-ex-btn`, `#mainTabs .nav-log-browse-row` in
`style.css`) sitting next to "Browse exercises" instead — same
`data-view="exercises"`/`.tab-btn` wiring as every other dropdown row, no
box either (transparent/borderless, muted color, just the glyph), styled
as a small square instead of a full-width row, and excluded from
`#mainTabs .tab-btn`'s default `width:100%` via a matching-specificity
override (see the CSS comment) rather than relying on source order. The
"Browse exercises"
disclosure is filled by `buildLogNavBrowser()` (`log-tab.js`): one nested
`<details>` per `activeProfile().muscles` entry (skipped if that muscle
has zero exercises, same as `exercises-tab.js`'s `renderExerciseManage()`
already did), muscle label colored via `muscleColors`, one button per
exercise inside — clicking it calls `jumpToExercise()` (`suggested-tab.js`)
and closes the dropdown, reusing the exact same add-to-plan-and-scroll-to-it
behavior the Suggested tab's chips already use rather than inventing a
separate read-only preview. Rebuilt wherever `state.EXERCISES` already
gets rebuilt (`main.js`'s `init()`, and `addExercise()`/rename/delete in
`exercises-tab.js`), not on every dropdown open.

**Header stats dropdown** (`#statsToggle`/`#statsDropdown`, wired in
`main.js`'s `init()`, opened/closed via `nav.js`'s `toggleStatsDropdown()` —
the same open/close pattern `toggleNavMenu()` already uses for
`#mainTabs`, just a second independent panel) shows the same four
`.stat` cards the Today's Workout page used to keep inline — total
weight lifted, days trained, last session, total pushups — but now from
a bar-chart icon next to the hamburger, available on every page instead
of just the Log tab. The two dropdowns close independently on an outside
click; opening one also force-closes the other (see `main.js`'s document
click listener). The panel itself is a fixed 320px wide (`.stats-dropdown-panel`,
`style.css`) regardless of the actual page width, so it reuses `.stats`'
4-column grid but overrides it to 2x2 (`.stats-dropdown-panel .stats`) —
4 columns in that little space left "Total pushups" (the longest label)
cramped/wrapping; the main inline `.stats` block elsewhere still gets the
full 4-column layout since it isn't width-constrained the same way.

**The muscle-select stage's 3D model** (`wheel3d.js`) tries
`/models/muscle-select.glb` first via `GLTFLoader` — the fast path, small
file, no extra decoder download, and what's currently in place — and
silently falls back to `/models/human.3dm`, the raw Rhino file, loaded
via Three.js's `Rhino3dmLoader` (backed by the `rhino3dm` WASM decoder,
pulled from a CDN at runtime — unlike the rest of Three.js, which is a
real npm dependency here, `rhino3dm` isn't, since it's loaded as a WASM
binary via `setLibraryPath()` at runtime, not imported as a module) if no
`.glb` exists. Both files are served from `public/models/` — see "Module
map" above. It exposes four methods on `window.IronLogWheel3D` — `show
(container)`, `hide()`, `resize()`, `hoverMuscle(key)` — a plain global
rather than an ES export, since it's the one piece of the app driving a
raw WebGL canvas instead of the
`state.js`-backed DOM: `show()` lazily creates the
renderer/scene on first call and is otherwise idempotent (safe to call
every time `enterMuscleGate()` runs), `hide()` just cancels the animation
frame loop (called from `leaveMuscleGate()`) so it isn't burning battery
while off-screen, and `resize()` is wired into the existing window
`resize` listener (`main.js`). If neither model file exists, `wheel3d.js`
renders a placeholder message instead of a blank canvas.

**The loaded model sits in two nested `Object3D`s, not one** —
`onModelReady()` wraps the loaded scene (`content`, which gets the
one-time orientation fix, scaling, and centering baked into its own
transform once and never touched again) inside an outer `model` Group
that `animate()` spins by writing `.rotation.y` every frame, forever.
These can't be the same object: Three's Euler angles compose in a fixed
axis order, so an object that has *both* a fixed `.rotation.x` (the
orientation fix) and a continuously-changing `.rotation.y` (the spin)
doesn't rotate around world-space vertical — it rotates around its own
tilted local axis after the X correction, which looked exactly like the
bug it was (spinning around the wrong axis, more like nodding than
turning). `organizeMuscleGroups()` reparents its merged per-muscle groups
(below) as children of `content`, in `content`-local space (via
`content.matrixWorld` inverted, not raw world space) — critical detail:
if those groups end up outside `content`'s subtree (e.g. added straight
to `scene`), they silently stop rotating with everything else, which is
exactly what happened before this was fixed (only the leftover unmatched
geometry — the model's head/neck, not part of any named muscle layer —
was actually a child of `content`/`model`, so only the head/neck visibly
spun).

**Two glTF-export-specific fixups live in `wheel3d.js`, both discovered
by actually loading this app's own exported file** (`models/README.md`
has the reasoning): each profile's `modelGltfRotateXDeg` (`state.js` —
owner `90`, Diana `180`, see the "Profiles" section above) corrects
Rhino's glTF exporter not actually converting its native Z-up scene to
glTF's required Y-up, applied only to `content` on the glTF path, never
the `.3dm` one; and `sanitizeMaterials()` detects Rhino's "no material
assigned" default — which exports as pure black + fully metallic,
rendering as a solid black silhouette under this scene's simple lighting
— and swaps in a neutral grey non-metallic default, leaving any
genuinely-assigned material alone. Both are one-time corrections for this
specific export, not universal glTF handling; revisit them if a future
export already comes in right-side-up or with real materials.

**Individual parts of the 3D model are hoverable/clickable**, matched (in
order, for every mesh) against the mesh's own Name, then **any ancestor
node's Name** walking up to the model root, then (`.3dm`-only) the mesh's
Rhino Layer name read via `Rhino3dmLoader`'s per-mesh
`.userData.attributes.layerIndex` into the root's `.userData.layers`. The
ancestor-walk is what actually matters for a glTF export: Rhino's glTF
exporter turns each **Layer** into a named parent Group wrapping that
layer's objects, while the individual mesh primitives underneath get
auto-split into many small, generically-named pieces (thousands, for this
app's model) — so it's the *layer name showing up as an ancestor* that
carries the muscle name through, not the leaf meshes' own names.
`organizeMuscleGroups()` buckets matched meshes by muscle key, then
**merges each bucket's fragments into a single combined mesh** via
`BufferGeometryUtils.mergeGeometries()` — raycasting against thousands of
individual tiny meshes on every pointer move measured at roughly 1 second
per hover check before this, unusably laggy; merged, it's sub-millisecond.
Each merged mesh's material is cloned before the hover effect ever
touches it (`setHighlighted()`/`applyHighlight()`: emissive glow only,
color from `activeProfile().muscleColors` converted to Three's numeric
form (`hexToInt()`) — no scale change, an earlier version scaled the hovered
part up too, but that visibly shifted its position since a part's
geometric center isn't always where it visually looks centered) —
Rhino/glTF exports commonly share one material instance across many
objects, so mutating it in place would leak the glow onto unrelated parts
(this actually happened before the clone was added). `raycastAt()` drives
both true hover (desktop mousemove) and touch (a raycast seeded at
`pointerdown`, since touch has no hover-before-touch); a release that
wasn't a drag on a currently-hovered part dispatches a `musclepick`
CustomEvent on `#wheel3dContainer` (`detail.muscle`), which `main.js`
listens for once in `init()` and forwards straight into
`confirmMuscleSelection()` — same effect as clicking the button row,
which stays wired up as a fallback for parts that don't hover cleanly or
touch devices where precision taps are harder. Naming instructions (and
how to tune `HOVER_EMISSIVE_INTENSITY`) are in
`models/README.md`. Unnamed or unmatched geometry renders normally but is
inert — this degrades gracefully, so a model with no recognized parts at
all just isn't interactive yet, not broken.

**Hover is two-way between the 3D model and the muscle-pick-row
buttons.** `setHoveredKey()` (`wheel3d.js`) — the single choke point every
hover source already went through (pointer raycast, drag-seeded touch) —
also dispatches a `musclehover` CustomEvent on `#wheel3dContainer`
(`detail.muscle`, mirroring `musclepick`'s shape) every time the hovered
part changes; `log-tab.js`'s `enterMuscleGate()` listens for it once and
toggles a `.hovered` class on the matching `[data-muscle]` button (model →
button). The other direction reuses the same choke point from outside:
`window.IronLogWheel3D.hoverMuscle(key)` just calls `setHoveredKey(key)`,
wired to each button's `mouseenter`/`mouseleave` in
`buildMusclePickRow()` (button → model). Because both directions funnel
through one function, there's no separate "external hover" state to keep
in sync — a real pointer hover simply wins on the next raycast tick if
one is in progress, same as before this existed.

**The main nav is a hamburger dropdown, not a tab bar** (`nav.js`).
`#navToggle` (the three-bar button in the header's corner) toggles an
`.open` class on `#mainTabs` via `toggleNavMenu()`; the panel itself is
absolutely positioned under the button so it doesn't take up layout space
when closed. This is independent of the muscle-gate's `hidden` attribute
on the same element (`enterMuscleGate()`/`leaveMuscleGate()`, in
`log-tab.js`, hide the whole header, dropdown included, while `hidden` is
set) — the `[hidden]` CSS rule uses `!important` specifically so it
always wins regardless of the dropdown's own `.open` state. `.tabs`/`.tab-btn`
are also reused, unscoped, by the gate's sign-in/sign-up toggle
(`#strangerSignInTab`/`#strangerSignUpTab`), so anything dropdown-specific
is scoped to `#mainTabs` rather than the bare classes.

**Brand: the "Knife" wordmark** (`src/brand.js`). `renderKnifeTitle(modifier)`
builds the two-layer markup: a solid base `<span>` plus an absolutely-
positioned 30%-opacity "ghost" `<span>` that jitters via the
`knife-vibrate` CSS keyframes (`src/style.css`) — ported from a sibling
site, ffoorrkk.com's own "fork" title animation (fast ±1px diagonal
jitter per ~30ms step, not a rotation-based wobble). Two call sites, both
via the `--brand` `.knife-logo--<modifier>` size class: the gate screen
(injected by `gate.js`'s `bootstrap()`) and the main header (injected by
`log-tab.js`'s `setHeaderTitle()` — see "Header title" above, called from
`main.js`'s `init()` and `showTodayWorkoutPage()`/`nav.js`'s `setView()`
thereafter), each paired with a static
`.knife-desc` tagline — "A training log platform." — replacing what used
to be the dynamic fun-fact subtitle, see below. There used to be a third
site, a huge low-opacity copy sitting behind the 3D model on the wheel
page that vibrated harder the more the model was twisted — removed; the
wheel page has no text behind the model anymore. `brand.js` also exports
`knifeGlyphSvg()` — a hand-rolled knife shape (blade + handle) kept only
as the figurine grid's fallback if `FIGURINE_IMAGES` (`state.js`) is ever
emptied; the grid and `#skipToLogBtn`'s crossed-knives hover icon both use
the real knife logo now (`public/images/knife-logo.png`) instead —
`#skipToLogBtn` stacks two `<img>` copies of it, pre-rotated ±45° via CSS
(same technique the SVG version used, just an image instead of an inline
path) to form the X, crossfading with the house icon on hover/focus. See
"The gate" below for the figurine grid.

There used to be a dynamic "curiosity" fun fact as the header's subtitle
(`src/fun-fact.js`, since removed) — `renderFunFact()` picked a random
comparison from `public/data/comparisons.txt` (`label|weight_in_kg` per
line) that the user's total lifted volume exceeded. That file is still on
disk (it's user-edited content, not code) but nothing reads it anymore;
the header/gate subtitle is now the static `.knife-desc` tagline above.

**The gate** (`gate.js`; `GATE_ENABLED` in `state.js`, currently `true` by
default in this repo — see the note in "What this is" about disabling it
before a public deploy): when on, `bootstrap()` (not `init()`, in
`main.js`) is the
`DOMContentLoaded` entry point. It shows `#gateScreen` — a single 20×20
grid of decorative figurine buttons, every cell the same real knife logo
(`public/images/knife-logo.png`, via `FIGURINE_IMAGES` in `state.js`,
same natural black on every cell, not recolored) that spins 360° on hover
(purely cosmetic; the image replaced the original alien-blob SVG art
during the Knife rebrand, nothing about the verify/click logic below
changed) — one grid serving *both* the owner and Diana, since a cell's
meaning is resolved server-side, not by anything the client picks in
advance. `renderFigurineCell()` (`gate.js`) still falls back to a
hand-rolled, randomly-colored SVG knife glyph (`knifeGlyphSvg()`,
`brand.js`) if `FIGURINE_IMAGES` is ever emptied. It
stays showing until either `ironlog:ownerUnlocked`/`ironlog:dianaUnlocked`
(`OWNER_UNLOCK_KEY`/`DIANA_UNLOCK_KEY`, `state.js`) or an active Supabase
Auth session is present, then hides the gate and calls `init()`.

Clicking a cell posts to the `verify-figurine` Edge Function
(`supabase/functions/verify-figurine/`), which checks it against
`profile_secrets` (`profile text primary key, correct_cell int`, no
anon/authenticated RLS policies — the only thing that ever sees which
cell is correct, and for which profile) and responds `{granted, profile}`
— `onFigurineClick()` (`gate.js`) branches on `profile`: `"diana"` first
checks `diana_gate_settings.gate_enabled` (`loadDianaGateSetting()`) and,
if still on, shows the Q&A challenge (`#dianaQaView`) before unlocking —
see "Profiles: the owner and Diana" above for that whole flow. `"owner"`
is the mirror-image, simpler case: `handleOwnerGranted()` checks
`owner_gate_settings.gate_enabled` (`loadOwnerGateSetting()`/
`setOwnerGateSetting()`, `supabase/owner_gate_schema.sql`, off by
default — unlike Diana's, which defaults on) and, if on, shows
`#ownerPasswordView` — a single password field checked client-side
against `OWNER_LOGIN_PASSWORD` (`state.js`, `"1111"`), same
typed-confirmation-friction category as `EXERCISE_DELETE_PIN`, not a
real second factor (no Edge Function, no server-side rate limiting —
this is a much weaker, deliberately simple gate than Diana's Q&A, by
design, not an oversight). Toggled from Developer Tools' "My login"
section, same "Locked"/"Unlocked" pill + "Turn on"/"Turn off" pattern as
Diana's toggle (see "Developer Tools" below).

**A hidden shortcut past all of this**: clicking the knife wordmark on
the gate screen itself (`#gateLogoSlot`, `wireKnifeShortcut()`, `gate.js`)
prompts for a password and, if it matches `OWNER_LOGIN_PASSWORD`, unlocks
the owner profile and jumps straight to Developer Tools — skipping the
figurine grid entirely. This exists so the owner can always get in and
flip a toggle (their own gate's, or Diana's) even without solving the
grid, and works regardless of whether the owner's own gate toggle above
is currently on or off — it's a separate, always-available entry point,
not a bypass of that specific flow's own on/off state. There's no visual
hint that the wordmark is clickable; that's the point.
`profile_secrets` itself is a Phase-3 generalization of what used to be a
strict one-row `owner_secret` table (still present, unused, migrated from
— see `supabase/diana_schema.sql`) so a second profile could get its own
secret cell without a second near-duplicate table. Rate limiting is
enforced server-side too, via `figurine_attempts` (grid clicks) and
`diana_qa_attempts` (Q&A attempts, a separate table since it's a
different step) — not just the client's 5s cooldown timers.

"I'm a stranger" is a normal Supabase Auth email/password flow, a third
identity path independent of the owner/Diana profile system — every row
in `workout_entries`/`exercises` carries a `user_id`; the owner's and
Diana's are fixed sentinel UUIDs (`OWNER_SENTINEL_ID`/`DIANA_SENTINEL_ID`),
not `NULL`, because Postgres primary/unique keys can't contain NULL and
`exercises` is keyed on `(user_id, name)` so multiple identities can each
have a "Bench" (or, for Diana, a "Squats"). A stranger reuses the owner's
muscle taxonomy (`enterApp("owner")` after a successful stranger sign-in
— Diana's categories are curated for Diana specifically, not a generic
template) while their data stays fully isolated via `auth.uid()`,
independent of `activeProfile()`. **This gates the page, not the data** —
the owner's and Diana's rows are still reachable by anyone holding the
public anon key, exactly as before; see the README's
"Optional: figurine-grid login" section before assuming it protects
anything sensitive.

**Developer Tools** (`#viewDevTools`, `gate.js`'s `renderDevToolsView()`)
is a new page holding admin-y switches that don't belong on a regular
tab — Diana's gate toggle (moved here from its old header button) and
now the owner's own "My login" toggle, each in its own `<section>` (see
below for why). `wireDevToolsVisibility()` (`gate.js`, called once from `main.js`'s
`init()`) hides the `#devToolsTabBtn` dropdown entry entirely unless
`useSupabase && GATE_ENABLED && activeProfile().key === "owner"` — the
same condition the old header toggle already checked — so Diana and any
stranger never see the tab exists, not just a disabled/empty version of
it. Unlike that old toggle (wired once, kept in sync in place),
`renderDevToolsView()` is rebuilt fresh every time the tab is opened,
same "re-render per visit" pattern `renderExerciseManage()` already
uses. The UI is deliberately explicit about a toggle that's otherwise
easy to misread: a status pill reading **"Locked"** or **"Unlocked"**
plus one line spelling out what each actually means ("Locked: Diana must
answer a security question…" / "Unlocked: her page opens right after the
correct cell…"), and a button whose own label names the action it's
about to perform — **"Turn on"** when currently unlocked, **"Turn off"**
when currently locked — rather than a static label plus a separate
active/inactive visual state you have to already know how to read. The
**"My login"** section (`#ownerGateStatus`/`#ownerGateExplain`/
`#ownerGateToggleBtn`) is the owner-equivalent toggle, added as its own
`<section>` per the rule below rather than folded into Diana's — same
copy pattern, own explanation text ("Locked: your own cell also asks for
a password…"), backed by `owner_gate_settings` instead of
`diana_gate_settings`. If a further toggle is ever needed here (the user
mentioned a hypothetical, not-yet-real "email verification" switch as a
future possibility), give it its own `<section>` too rather than
overloading an existing one.

**The Feedback tab** (`#viewFeedback`, `src/feedback-tab.js`) is a
one-way note to the developer — a textarea and a Send button that insert
into a new `feedback` table (`supabase/feedback_schema.sql`, a migration
the user needs to run) and nothing else; `renderFeedbackView()` is called
fresh every time the tab opens (`setView()`, `nav.js`) so a prior send's
"Thanks…" state never lingers into a new visit. **This table has no
`select` policy for either `anon` or `authenticated`** — deliberately;
the point is that feedback is readable only from the Supabase
dashboard/service role, never from the client, matching "received in
backend, not visible from html" literally, not just by convention.
`submitFeedback()` inserts `{user_id: currentUserId(), sender_name:
currentUserLabel(), message}` — `currentUserLabel()` (new, next to
`currentUserId()` in `persistence.js`) is `"Owner"`/`"Diana"` from
`activeProfile().key`, or the stranger's own email if
`state.currentSession` is set; used only for the `Thanks for your
message, ${name}!` confirmation copy, not an identity/security concept.
If `!useSupabase`, submitting just alerts that feedback needs a network
connection — there's no localStorage fallback here, unlike everywhere
else in this app, since "the developer receives this" has no meaning
without a real backend to receive it.

## Conventions specific to this codebase

- Exercise identity is the exercise **name** (a string), used (together
  with `user_id`) as the primary key in the `exercises` table and as the
  foreign-key-like value on `workout_entries.exercise`. There's no
  separate numeric ID for exercises. Renaming (`renameExercise()`,
  `persistence.js`) updates both the `exercises` row and every
  `workout_entries` row referencing the old name, since there's no DB
  foreign key tying them together.
- `entries` (workout sets) use a generated `id` of the form
  `${timestamp}-${random}` — see `logWorkout()` and `saveEditedGroup()`
  (`log-tab.js`).
- Every mutating flow (log a workout, edit a group of sets, add an
  exercise, toggle backbone, clear all data) follows the same pattern:
  mutate `state` first, then `await` the persistence call, then
  re-render. Persistence functions alert the user and return `false` on
  failure rather than throwing, so callers generally don't need try/catch
  of their own.
- CSS custom properties in `:root` (`src/style.css`: `--plate`, `--steel`,
  `--paper`, etc.) define the palette; `--steel` is a legacy name (blue,
  then orange) and is now the mint-green half of the brand pair (red
  `--plate` #cc382a / mint `--steel` #3fa876, everything else
  black/white/gray) — don't be misled by the name. Each profile's
  `muscleColors` (`PROFILES`, `state.js`) and `FIGURINE_COLORS` are
  deliberate exceptions to that palette: muscle categories need several
  mutually distinguishable colors (a validated categorical set from the
  dataviz work — the owner's 6 and Diana's 4 both draw from it), which
  red+mint alone can't provide, and the figurine grid's colors are their
  own derivative set.
- `jspdf-autotable` is called as `autoTable(doc, opts)` (`export.js`),
  not `doc.autoTable(opts)` — the functional form the package's own docs
  recommend for bundler setups, since the alternative (a side-effect
  import that monkey-patches the jsPDF prototype) bundles its own
  internal copy of jsPDF to patch, which isn't guaranteed to be the same
  class instance this file's own `import jsPDF from "jspdf"` produces.

## Testing changes

There's no automated test suite. Verify by running the dev server
(`npm run dev`) and exercising the affected flow in a browser, or headless
via Playwright.

**Never test against the real Supabase project.** In `state.js`, reset
`SUPABASE_URL`/`SUPABASE_ANON_KEY` to the `"YOUR_..."` placeholders (in a
throwaway copy of the repo, not the real one) before running — this forces
the localStorage fallback path so test runs never touch the real
database. Do this in a **copy** of the whole project (`rsync` or `cp -r`,
excluding `node_modules` — symlink that in instead, or reuse the real
project's install, to avoid a slow reinstall per test copy), not just
`index.html`, since state now lives in `src/state.js`.

**Testing the gate/auth flow** needs a different approach than before:
Supabase's client is a real npm import (`createClient()` from
`@supabase/supabase-js`) now, not a `window.supabase` global, so mocking
a global object no longer works. Instead, use Playwright's
`page.route('https://<fake-project>.supabase.co/**', handler)` to
intercept at the network level — set `SUPABASE_URL` to a syntactically
real-looking but fake URL (so `useSupabase` evaluates true and
`GATE_ENABLED` can be tested), then fulfill routes matching
`/auth/v1/*`, `/functions/v1/verify-figurine`, `/functions/v1/diana-qa`,
and the REST table endpoints (`/rest/v1/...`, respond with `[]` for "no
rows") with controlled fake JSON responses.

**Testing Diana's profile specifically doesn't need any of that**, since
it's all driven by `state.activeProfile` and the localStorage fallback
still works normally: in a throwaway copy with placeholder Supabase keys
(so the gate itself is skipped, per `bootstrap()`), temporarily flip
`state.js`'s `state.activeProfile` default from `"owner"` to `"diana"`
and reload — the whole app (wheel, quick-log, full log, Progress,
Suggested, Exercises) renders as Diana off her own `localStorage`-fallback
data (`ironlog:entries:diana`/`ironlog:exercises:diana`, per
`profileScopedKey()`, `persistence.js`), with zero risk to the real
database. Revert the flip afterward — it's a temporary hack for the
*test copy* only, never land it in a real commit. This can't exercise the
actual figurine-cell → Q&A → unlock round trip (that needs real
Supabase), but it's the fast way to check the `activeProfile()` refactor
itself: muscle categories/colors/exercises, the wheel's hover mapping
(including that "Glutes" correctly never lights up the 3D model), and
that switching back to the owner default afterward shows no
cross-contamination between the two profiles' data.

## Status notes (for Claude's reference — trim once stale)

- **Fixed a real profile-isolation bug**: `loadEntries()`, `loadExercises()`,
  and `renameExercise()` (`persistence.js`) queried `exercises`/
  `workout_entries` without filtering by `user_id`, so once Diana's
  profile widened the anon-role RLS policy to allow *either* sentinel
  UUID through, those queries silently returned/touched both profiles'
  rows — reported by the user as exercises added under Diana appearing
  under the owner too. All now filter by `.eq("user_id",
  currentUserId())`; `clearAllData()` (`export.js`) had the same issue in
  a more dangerous form (`.delete().neq("id", "__none__")` = delete
  everything, both profiles) and is fixed the same way. `deleteExercise()`
  already had the filter (added when that feature shipped), which is why
  deletion alone worked correctly while everything else didn't. Verified
  by pulling the dev-served `persistence.js` source directly and
  confirming the filter is present everywhere it needs to be — the actual
  Supabase writes were never the problem (every write path already set
  the correct `user_id` per row), only reads/updates/broad-deletes were
  under-scoped, so **no known data was corrupted**, but it's worth
  spot-checking the real `exercises`/`workout_entries` tables' `user_id`
  column in the Supabase table editor once, since a rename made while a
  same-named exercise existed under both profiles *would* have renamed
  both — that specific scenario wasn't reported and may not have
  occurred.
- Exercise deletion (any profile, backup-then-cascade-delete, 6-digit
  code gated when there's logged history) is implemented and verified
  end-to-end against the localStorage fallback: no-log delete (plain
  confirm), wrong-code rejection, correct-code delete, and the backup row
  existing (with the right entries JSON) before the delete completed —
  all confirmed via a throwaway copy with `window.prompt`/`confirm`/
  `alert` stubbed out (never trigger real ones through browser
  automation — they block all further events). Still outstanding: run
  `supabase/exercise_backups_schema.sql` for this to work against the
  real database (the table doesn't exist until then, so
  `backupExerciseDeletion()` will fail closed and refuse to delete
  anything — the safe direction to fail in, but worth knowing before
  wondering why a delete silently does nothing).
- Diana's profile (second fixed profile, her own muscle categories/
  exercises/charts, the figurine-grid → optional Q&A gate, the owner's
  toggle) is implemented and passes local verification (forced
  `state.activeProfile = "diana"` against the localStorage fallback — see
  "Testing changes" above). What's still outstanding, all requiring the
  user to act:
  - Run `supabase/diana_schema.sql` in the SQL editor.
  - Redeploy `verify-figurine` (its response shape changed — now
    `{granted, profile}`) and deploy the new `diana-qa` function.
  - Replace `diana_qa`'s 2 placeholder rows with real questions/answers
    (an `update`/`delete`+`insert` you run yourself — never put real
    answers in this repo).
  - Confirm Diana's cell (computed as the owner's `+1`) actually landed
    "one to the right" and not wrapped to the next row — see the caveat
    in `supabase/diana_schema.sql`.
  - The real figurine-cell → Q&A → unlock round trip against production
    Supabase hasn't been (and can't safely be) exercised by Claude — walk
    through it once deployed.
  - Diana's own model (`public/models/diana-muscle-select.glb`, plus
    `diana-human.3dm` locally — see below) has replaced the earlier
    shared-owner's-model stand-in — all 4 of her categories, including
    glutes, now have real 3D geometry and hover/highlight correctly.
    Verified visually (two-way hover on "Glutes" specifically, plus a
    full rotate-and-inspect pass on the model itself) against a
    throwaway copy defaulted to `state.activeProfile = "diana"`. The
    model's own pose (limbs bent, mid-motion, not a neutral standing pose
    like the owner's) is intentional on the artist's part, confirmed by
    rotating the camera around it — not an orientation bug. Her export
    *did* need its own rotation value though: the shared flat
    `GLTF_ROTATE_X_DEG` constant is gone, replaced by a per-profile
    `modelGltfRotateXDeg` (`state.js`) — owner `90`, Diana `180` (90°
    alone left her lying on her back looking up; a second +90° stands her
    upright). The artist also re-exported her model with an explicit
    "Upper Body" layer (replacing the earlier catch-all "Layer 01"
    mapping), so `modelLayerAliases.diana.upper` now reads `["upper
    body"]` — see the "Profiles" section above for both.
  - `diana-human.3dm` (~101MB) is over GitHub's 100MB-per-file push
    limit — `git push` rejected it outright the first time (the commit
    had to be redone with that one file unstaged, via `git reset --soft
    HEAD~1` since the rejected push never reached the remote, nothing
    shared was touched). It's still present locally, un-tracked, so local
    dev has the full owner-equivalent fast-path+fallback setup, but the
    deployed build only has Diana's `.glb`. Not currently a functional
    problem (the `.glb` is the one that actually loads), but means her
    setup has no `.3dm` safety net server-side if that ever changes —
    see `models/README.md` for the fix options (shrink the file in Rhino
    below 100MB, or Git LFS, deliberately not set up without checking
    with the user first).
- The "Knife" rebrand (wordmark + ghost-vibrate title, Geist Sans, the
  quick-log stage, two-way wheel/button hover, the house/knives hover
  icon, the gate's figurine art) is done — see "Brand: the 'Knife'
  wordmark", the updated "Logging a workout…" section, and the updated
  "The muscle-select stage's 3D model" section above for the details.
  `src/fun-fact.js` was removed as part of this; nothing else was
  restructured beyond the new `src/brand.js` module.
- A follow-up pass after the initial rebrand: the wheel page's vibrating
  low-opacity backdrop title was removed entirely (nothing sits behind
  the 3D model now) — `getTwistIntensity()` (`wheel3d.js`) went with it,
  since scaling that vibration was its only caller. The figurine grid and
  `#skipToLogBtn`'s crossed-knives hover icon both switched from the
  hand-rolled SVG knife glyph to a real logo file dropped in by the user
  (`public/images/knife-logo.png`, via `FIGURINE_IMAGES`, `state.js`) —
  the SVG glyph (`knifeGlyphSvg()`, `brand.js`) survives only as
  `renderFigurineCell()`'s fallback if that array's ever emptied.
  `crossedKnivesSvg()` was deleted outright (no fallback need — replaced
  by two `<img>` copies in `index.html` directly). Diana's gate toggle
  moved from a section at the bottom of the Exercises tab to a button in
  the header next to the hamburger (`#dianaGateToggle`, wired once by
  `wireDianaGateToggle()`, `gate.js`, from `main.js`'s `init()`) — visible
  on every page for the rest of the owner's session, not just that tab.
- The full `index.html` → Vite/ES-modules reorg described throughout this
  file is done and pushed to `main` (commit `e75b82d`): hover-scale bug
  fixed (color-only now), the two spin bugs fixed (wrong axis + only
  head/neck rotating), and the ~2000-line inline script split into the
  `src/` modules listed under "Module map."
- Not yet actioned, only noted as optional/tangential — don't start on
  these without the user asking: trimming the ~1.27MB main JS bundle
  size; upgrading `jspdf`/`vite` to clear `npm audit` warnings (held back
  deliberately to avoid destabilizing tested versions).
- `weight_lifted_loading_screen_captions_v2.md` sits untracked at the
  repo root — the user dropped it in; it's not wired into the app and
  hasn't been asked for yet.
- The next Vercel deploy after the reorg hasn't been confirmed live yet —
  it should auto-detect the new Vite setup via `package.json`, but check
  the deploy log if the user reports something looks off post-deploy.
- **The Create Plan / Today's Workout plan-then-log flow** (see "Logging a
  workout is a plan-then-log flow" above) is implemented and verified
  end-to-end against the localStorage fallback in a throwaway copy, across
  two rounds — the first had "Create Plan" and the wheel's muscle-taps
  both open dedicated, input-less picker *stages*, separate from
  `#logMainStage`; the user asked for the "old logic" back (one page that
  always lists everything) plus a gray "Today's Workout" box in place of
  stats, so the standalone all-exercises picker stage was removed and its
  job folded directly into `#logMainStage`'s new "All exercises" list —
  the version now described above and the one actually verified last.
  Checked: hover-color match (button row agrees with the 3D model's own
  per-muscle glow), "Create Plan" and the muscle-scoped picker's "Train
  more" both landing on `#logMainStage` (not the wheel), adding exercises
  from the "All exercises" list and watching them appear in the gray box
  with no reps/weight required, logging a set and confirming the block
  stays on the page afterward with the entry showing up correctly in
  "Latest by exercise", plan persistence across a reload, and the header
  title swap across tab switches. `jumpToExercise()` (Suggested tab) was
  re-verified too. Still outstanding: run `supabase/today_plan_schema.sql`
  against the real database (the `today_plans` table doesn't exist until
  then, so `saveTodayPlan()` will fail closed with an alert and the plan
  just won't persist server-side — same fail-safe direction as the
  exercise-backups table).
- **A real hover bug in Diana's model, found while investigating the
  above and now fixed** (see "A real bug shipped with that 'Upper Body'
  layer" above): her "Upper Body" layer never lit up on hover — not a
  regression from this session's other changes, it silently never worked
  since that layer was added. Root cause: Three.js's `GLTFLoader`
  sanitizes multi-word node names, turning "Upper Body" into "Upper_Body"
  at runtime, which never matched the `"upper body"` alias. Verified fixed
  live (forced `state.activeProfile = "diana"` in a throwaway copy,
  confirmed the torso/shoulders/arms region now glows blue on hover, both
  via direct `hoverMuscle('upper')` calls and the button row).
- **The mobile first-load zoom bug** (page/model/text reading zoomed in
  right after a fresh reload on mobile) could **not** be conclusively
  reproduced or fixed with certainty in this environment — the browser
  automation available here doesn't accurately emulate a real mobile
  device (no true CDP device-metrics override, and critically, the
  behavior described sounds like a mobile Safari–specific scroll/zoom
  restore-on-reload quirk, which doesn't exist in Chrome at all, so it
  can't be reproduced or verified there regardless of viewport size).
  What's actually in place (`main.js`'s `init()`): `IronLogWheel3D.resize()`/
  `renderCharts()` now also re-run on `window`'s `"load"` and `"pageshow"`
  events and on `visualViewport`'s `"resize"` event, not just the plain
  `"resize"` event — covering the case where the 3D canvas's one-time
  initial sizing (`doResize()`, `wheel3d.js`) ran before the browser
  chrome (address bar) finished settling into its final size. `onLoadSettle()`
  also calls `window.scrollTo(0, 0)`, the standard mitigation for mobile
  Safari's own scroll/zoom-restore-on-reload behavior. Both are cheap and
  harmless even if they turn out not to be the actual cause — but this
  needs a real iPhone (or a teammate who has one) to actually confirm
  fixed, not just "no console errors in a resized desktop Chrome window."
- **A large nav/Dev-Tools/Feedback/Cardio batch** (see "Developer Tools,"
  "The Feedback tab," "Exercises are one of three types," and "The nav
  dropdown"/"Header stats dropdown" above) is implemented and verified
  end-to-end against the localStorage fallback in a throwaway copy: the
  person-icon nav item's tap-to-expand exercise browser (expand a muscle,
  click an exercise, lands correctly on the Today's Workout page with it
  flashed and added); the header stats dropdown opening independently of
  the hamburger on every tab; header titles per page matching what's
  documented above, with nothing reading "Knife" outside the gate; the
  "Add" button text and the add-set/remove button alignment fix (a long
  per-hand name and a short one both keep their buttons flush together);
  a full cardio round-trip (adding "Run" from the picker, logging
  5.2km/28min, confirming it renders correctly in Latest-by-exercise and
  Full log); the Cardio checkbox's mutual exclusivity with Per hand/Track
  weight in the Exercises tab, and adding a new cardio exercise through
  it. **Not** verified against real Supabase (the same "can't safely be
  exercised by Claude" limitation as Diana's Q&A gate) — the Developer
  Tools page's owner-only visibility, its actual toggle round-trip against
  `diana_gate_settings`, and the Feedback tab's real insert all need a
  manual pass once `supabase/feedback_schema.sql` and
  `supabase/cardio_schema.sql` are run (both fail closed — an alert, no
  data loss — until then, same as every other migration here). The
  comment-cleanup pass (grepped every short in-code comment across
  `src/*.js`) didn't find much to trim: this codebase's comments already
  follow a "why, not what" convention from well before this pass, so
  there wasn't the kind of restates-the-next-line noise that pass was
  meant to remove — noted here rather than manufacturing deletions just
  to show activity.
- **A second batch, on top of the one above**: Cardio is now backbone on
  both profiles (Diana's `muscles`/`muscleLabels`/`muscleColors` gained a
  `cardio` entry, `DIANA_DEFAULT_EXERCISES` gained her own "Run"/"Row"),
  per the new "Functional changes default to every profile" rule (see
  "Profiles: the owner and Diana"); the wheel's Cardio button moved to its
  own row below the muscle-group row and now opens a "what type" dropdown
  picker instead of a button list (see "Cardio gets its own row on the
  wheel" above); logging a workout now removes the exercises it actually
  logged from `state.todayPlan` and shows a `.toast` confirmation instead
  of leaving them in place with no feedback (see "Logging a workout is a
  plan-then-log flow" above); the nav dropdown's standalone "Exercises"
  row was replaced with a small "+" next to "Browse exercises" (see "The
  nav dropdown" above); and `showLoginGreeting()`'s one-off toast styling
  was generalized into a shared `.toast` base class (`dom-utils.js`'s
  `showToast()`) so the new post-log confirmation didn't need its own
  copy of the same fade animation. Verified against the localStorage
  fallback in a throwaway copy: Diana's wheel now shows a Cardio row
  under her 4-button row and its dropdown adds "Run"/"Row" to her plan
  correctly; logging a mixed plan (one exercise filled in, one left
  empty) removes only the filled one and leaves the other for later; the
  toast appears and fades without a page scroll; the nav dropdown's "+"
  opens the Exercises tab and the standalone row is gone. Not verified
  against real Supabase (`today_plans`/`exercises` writes) — same
  standing limitation as everywhere else in this file.
- **A third batch**: "Swim" added as a third seed cardio exercise
  (alongside Run/Row) on both profiles' default rosters; and the owner
  now has their own optional second factor on the figurine grid, mirrored
  off Diana's Q&A gate but deliberately simpler — a single hardcoded
  password (`OWNER_LOGIN_PASSWORD`, `state.js`, `"1111"`) checked
  client-side, toggled from Developer Tools' new "My login" section
  (`owner_gate_settings`, `supabase/owner_gate_schema.sql`, off by
  default), plus a hidden shortcut (click the gate screen's knife
  wordmark, enter the same password) that skips the grid entirely and
  drops straight into Developer Tools — see "The gate" and "Developer
  Tools" above for the full design. Verified: the Swim option shows up in
  the cardio "what type" dropdown correctly (localStorage fallback,
  throwaway copy); `npm run build` succeeds; every DOM id the new gate.js
  code references exists in `index.html` (checked programmatically, not
  just by eye). **Not verified**: the actual owner-password click-through
  (grid → password → unlock), the knife-shortcut, and the new Developer
  Tools toggle's round-trip against `owner_gate_settings` — all need real
  (or Playwright-mocked) Supabase, the same "can't safely be exercised by
  Claude" limitation noted elsewhere in this file for Diana's Q&A gate;
  an attempt to test this live against a fake-but-real-looking Supabase
  URL hung the browser tab (an unreached fake domain, not a code issue)
  rather than failing fast, so it wasn't pursued further here. Still
  outstanding, requiring the user to act: run
  `supabase/owner_gate_schema.sql` in the SQL editor (fails closed/alerts
  until then, same as every other migration here), then walk through the
  real grid → password flow and the knife-shortcut once deployed.
- **A fourth batch, UI polish plus one real bug fix**: the "seed if
  empty" gap that left already-populated rosters with zero cardio
  exercises (see "Exercises are dynamic, not hardcoded" above) is fixed —
  `loadExercises()` now backfills any missing default cardio exercises
  onto a roster that has none, regardless of whether the roster was
  already non-empty; "Swim" also joins Run/Row as a third seed cardio
  exercise on both profiles. Nav-dropdown box removal: the "+"
  manage-exercises button and the Feedback/Developer Tools/Log out group
  are now plain, borderless, lower-hierarchy rows (`.nav-tab-minor`,
  `.nav-minor-group`) instead of full button boxes — see "The nav
  dropdown" above. `#logWorkoutBtn` is sized to its label instead of
  stretching the full Today's Workout box width. The header's stats
  dropdown now lays its 4 stats out 2x2 instead of 1x4, since the
  dropdown's own fixed 320px width made "Total pushups" cramped — see
  "Header stats dropdown" above. Verified in a throwaway localStorage-fallback
  copy: seeded a roster with zero cardio exercises, reloaded, and
  confirmed Run/Row/Swim all appeared in the cardio picker without
  clearing the rest of the roster; added one to the plan and confirmed
  the distance (km)/time (min) boxes and a content-width "Log workout"
  button render correctly on Today's Workout; the nav dropdown's "+" and
  Feedback/Developer Tools/Log out render box-free with the divider; the
  stats dropdown's 2x2 layout fits all four stats cleanly. No console
  errors; `npm run build` succeeds. Not committed/pushed yet as of this
  note — ask before assuming it's live.
