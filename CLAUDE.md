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
                        cssEscape, exerciseSort, triggerHaptic
  persistence.js        Supabase ⇄ localStorage load/save/delete for
                        entries + exercises (see "Data layer" below)
  nav.js                 toggleNavMenu, setView — the hamburger dropdown
                        and cross-tab view switching
  brand.js               the "Knife" wordmark (ghost-vibrate title) and
                        an SVG knife-glyph fallback — see "Brand: Knife"
                        below. Imported by gate.js, main.js.
  log-tab.js             the muscle-select stage, the quick-log stage,
                        exercise blocks, logWorkout, grouped-row editing,
                        and render() (the central re-render dispatcher —
                        see below)
  progress-tab.js        the hand-rolled SVG charts
  calendar-tab.js         the calendar grid
  suggested-tab.js        Suggested-tab ranking + jumpToExercise
  exercises-tab.js        add/rename/delete/toggle-backbone exercise
                        management
  export.js              PDF export, JSON backup export/import, clear-all
  gate.js                 figurine grid (now the real knife logo PNG, not
                        the old alien-blob art) + Diana's Q&A gate step +
                        her header toggle + stranger auth + bootstrap()
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
EXERCISES, currentView, logMuscleFilter, editingGroupKey, …) lives as a
property on one exported object, `state`, from `state.js`. Any module
does `state.entries.push(x)` or `state.currentView = "log"` directly — no
setters needed, since you're mutating the object's properties, never
reassigning the `state` binding itself. When adding new mutable app data,
put it on `state`, not as a bare module-level `let`.

**Circular imports are intentional in a few places** (e.g. `log-tab.js`
imports render functions from `progress-tab.js`/`calendar-tab.js`/
`suggested-tab.js` for `render()`'s cross-tab dispatch, while
`suggested-tab.js` imports back from `log-tab.js` for `jumpToExercise()`).
This is safe here because every circular reference is only ever *used*
inside a function body (called later, after both modules have finished
loading), never read at module-evaluation time — if you introduce a new
cross-module call, keep it inside a function, not at the top level of the
file, or the circular import will break.

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
`Core`/`Legs`/`Glutes` layers (confirmed by parsing `female.glb`'s glTF
JSON chunk directly — no Rhino needed, it's an open, inspectable format)
plus one default, artist-unnamed layer ("Layer 01," Rhino's fallback name
for anything not assigned to a real layer) holding everything else — the
whole upper body, unsplit, which happens to match her single "Upper Body
(general)" category exactly. So `modelLayerAliases: { upper: ["layer
01"], glutes: ["glutes"], legs: ["legs"], core: ["core"] }` — all four of
her categories now have real 3D geometry, including glutes, which the
earlier shared-model version deliberately couldn't offer.
`wheel3d.js`'s `organizeMuscleGroups()` reads this map instead of a flat
key list, so it had to start importing `state.js` (it deliberately didn't
before — not worth plumbing for 6 static hex codes — but that stopped
being true once there were two real, differently-shaped profiles).

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
write behind — surfaced as a button in the header, next to the hamburger
(`#dianaGateToggle`, wired once by `wireDianaGateToggle()` in `gate.js`,
called from `main.js`'s `init()`), visible on every page for the rest of
that session rather than being tab-scoped, since `activeProfile()` never
changes mid-session. Solid/outlined mirrors its on/off state; it only
renders at all when `activeProfile().key === "owner"`, so Diana can't see
or flip her own gate.

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
suggestion algorithm.

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

**Logging a workout goes through three stages, not two**, all siblings
inside `#viewLog` (`log-tab.js`), only one visible at a time via `hidden`:
`#muscleSelectStage` (the wheel — shown by default and every time you
navigate back to the Log tab, see `setView()`) → `#quickLogStage` (a
single picked muscle group's exercise blocks only — no stats/tables/
toolbar) → `#logMainStage` (the full, unfiltered logging page with
stats/tables/toolbar). The muscle-select stage has a 3D model
(`#wheel3dContainer`, driven by `wheel3d.js`) that spins for feel when
dragged and highlights individual parts on hover/tap — see "The
muscle-select stage's 3D model" below — plus a row of plain buttons
underneath (`#musclePickRow`, built by `buildMusclePickRow()`) that also
pick the muscle group as a fallback, and hover each other two-way with
the 3D model (see below): clicking one (or tapping a recognized 3D part)
calls `confirmMuscleSelection(m)`, which now calls `enterQuickLog(m)` —
commits `m` to `state.logMuscleFilter` and reveals `#quickLogStage`,
still with header/nav hidden (same minimal-page treatment as the wheel
stage). A 2D spinning-dial picker (drag-to-rotate through 6 muscle
images, tap the centered one to confirm, no 3D model at all) filled the
wheel's role before the 3D model existed; its code (written for the
pre-Vite single-`index.html` layout, so the paste-back instructions are
stale, but the logic itself is still valid) is preserved in
`legacy/muscle-wheel-2d-backup.md` in case it's ever needed again.
`#quickLogStage`'s small back icon (`#quickLogBackBtn` → `goToGeneralLog()`)
is the only way from there to `#logMainStage`; the wheel stage's own
house/knives-hover icon (`#skipToLogBtn` → `skipToLogPage()`) reaches
`#logMainStage` directly, bypassing quick-log entirely — both land on the
same shared "show full chrome" helper (`showFullLogChrome()`).

Both `#quickLogStage` and `#logMainStage` render exercise blocks the same
way, just into different containers: `buildExerciseBlocks(containerSel =
"#exerciseBlocks")` and `logWorkout(containerSel = "#exerciseBlocks")`
both take an optional container selector (quick-log passes
`"#quickLogExerciseBlocks"`) so the two stages' blocks never collide —
scope any new query the same way if you touch this code. Each container
gets one `.exercise-block` per visible exercise (name + muscle-colored
left border, no images or icons), each with one or more `.set-row`s
(weight/reps inputs, "+ Add set" next to the exercise name via
`addSetRow()`), and a "Log workout" button (`logWorkout()`) batches every
filled row across every visible block in its container into one save —
nothing is saved per-keystroke or per-row. Both stages share the same
`#workoutDate` input (only present in `#logMainStage`'s markup) — there's
no separate date picker on the quick-log page. `jumpToExercise()`
(`suggested-tab.js`) explicitly skips both `#muscleSelectStage` and
`#quickLogStage`, broadens `state.logMuscleFilter` to show every
exercise, then scrolls to and flashes the target block in
`#logMainStage`. The muscle filter chips above the `#logMainStage` block
list (`buildMuscleFilterRow()`) follow an isolate/add/toggle-off pattern:
from "All", clicking a muscle isolates it; clicking a different muscle
adds it to the selection; re-clicking an already-active muscle removes
it; the "All" chip is the only way to jump straight back to showing
everything.

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
has the reasoning): `GLTF_ROTATE_X_DEG` (currently `90`) corrects Rhino's
glTF exporter not actually converting its native Z-up scene to glTF's
required Y-up, applied only to `content` on the glTF path, never the
`.3dm` one; and `sanitizeMaterials()` detects Rhino's "no material
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
and the main header (injected by `gate.js`'s `bootstrap()` and
`main.js`'s `init()` respectively), each paired with a static
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
— `onFigurineClick()` (`gate.js`) branches on `profile`: `"owner"` unlocks
immediately (unchanged from before Diana existed); `"diana"` first checks
`diana_gate_settings.gate_enabled` (`loadDianaGateSetting()`) and, if
still on, shows the Q&A challenge (`#dianaQaView`) before unlocking — see
"Profiles: the owner and Diana" above for that whole flow.
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
    rotating the camera around it — not an orientation bug;
    `GLTF_ROTATE_X_DEG` (`wheel3d.js`) needed no per-profile change, same
    `90` works for both exports.
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
