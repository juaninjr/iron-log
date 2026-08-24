# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Iron Log — a personal gym workout tracker. Single-user by default, no login.
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
                        (MUSCLES, MUSCLE_COLORS, DEFAULT_EXERCISES,
                        Supabase config, GATE_ENABLED, VIEW_IDS, …) —
                        see "The state object" below before touching
                        any mutable app data
  dom-utils.js           $, $all, clamp, todayISO, fmtDate, fmtDateShort,
                        cssEscape, exerciseSort, triggerHaptic
  persistence.js        Supabase ⇄ localStorage load/save/delete for
                        entries + exercises (see "Data layer" below)
  nav.js                 toggleNavMenu, setView — the hamburger dropdown
                        and cross-tab view switching
  log-tab.js             the muscle-select stage, exercise blocks,
                        logWorkout, grouped-row editing, and render() (the
                        central re-render dispatcher — see below)
  progress-tab.js        the hand-rolled SVG charts
  calendar-tab.js         the calendar grid
  suggested-tab.js        Suggested-tab ranking + jumpToExercise
  exercises-tab.js        add/rename/toggle-backbone exercise management
  export.js              PDF export, JSON backup export/import, clear-all
  fun-fact.js            loads data/comparisons.txt, picks the header's
                        "curiosity" line
  gate.js                 figurine grid + stranger auth + bootstrap()
  wheel3d.js              the 3D muscle-select model (Three.js) — see
                        "The muscle-select stage's 3D model" below
public/                 static assets served as-is at the site root —
                        fonts/, images/, data/comparisons.txt, models/*
```

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
logic, update both branches. The Supabase schema (two tables:
`workout_entries`, `exercises`) lives in `supabase/schema.sql`, written to
be safely re-runnable (`create table if not exists`, `drop policy if
exists` before `create policy`). If you change the data model, update
that file too and call it out — the user has to manually re-run it in the
Supabase SQL editor; there's no migration tooling and no service-role key
available to run DDL programmatically. The optional gate's schema
(per-user scoping, `profiles`, `owner_secret`, `figurine_attempts`) is a
separate, later migration in `supabase/auth_schema.sql` — same
re-runnable convention.

**Exercises are dynamic, not hardcoded.** `DEFAULT_EXERCISES` (`state.js`)
is the seed list (the original 13 movements, each tagged with a `muscle`
category and `backbone: true`). At startup `loadExercises()`
(`persistence.js`) reads the live roster from the DB/localStorage,
seeding it from `DEFAULT_EXERCISES` if empty, into `state.EXERCISES`.
Exercises added later via the Exercises tab default to `backbone: false`.
"Backbone" exercises are the pool the Suggested tab draws recommendations
from — this lets users add one-off exercises without polluting the
suggestion algorithm.

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
come from `MUSCLE_COLORS` (`state.js`, one fixed color per muscle group —
see "Conventions" below). Weighted and reps-only exercises are charted
separately (two charts) since mixing kg and reps on one axis would be
misleading.

**The Suggested tab's algorithm** (`suggested-tab.js`):
`muscleLastTrained()` finds the most recent log date per muscle group
across *all* logged entries (any exercise, not just backbone ones), ranks
muscle groups from most-to-least-recently trained, then picks the
least-recently-trained group that has at least one *backbone* exercise
(skipping groups with zero backbone exercises, e.g. an empty category)
and suggests from that group's backbone exercises, ranked by their own
individual recency.

**Fonts are self-hosted**, not loaded from Google Fonts —
`public/fonts/*.woff2` (the Karrik typeface, OFL-licensed), referenced by
absolute `/fonts/...` paths in `@font-face` declarations at the top of
`src/style.css`. Karrik only ships Regular and Italic (no bold face), so
both `@font-face` rules declare `font-weight:100 900` — a range, so the
browser treats Regular as valid for any requested weight instead of
synthesizing a faux-bold. `Gluten-master/` and `karrik_fonts-main/` (the
full upstream font source repos) are gitignored and irrelevant to the
app; only the woff2 files actually copied into `public/fonts/` are used.
`fonts/OFL.txt` (the license text) stays at the repo root, not in
`public/` — it's documentation, not a runtime asset.

**Exercise body diagrams are illustrated PNGs**, not generated shapes —
`public/images/{chest,back,shoulders,biceps,triceps,core,legs,glutes}.png`,
each a full-body outline with one region highlighted in an orange/red
gradient. These aren't used anywhere in the app currently (the
muscle-select stage that used to show them is now the 3D model below);
`biceps`/`triceps`/`glutes` in particular were never wired to any
muscle-group entry in `MUSCLES` even before that.

**Logging a workout is a muscle-select stage followed by a classic
block-list form**, both in `log-tab.js`. The Log tab (`#viewLog`) has two
children toggled via `hidden`: `#muscleSelectStage` (shown by default and
every time you navigate back to the Log tab — see `setView()`) and
`#logMainStage` (the actual logging page, hidden until you pick a muscle
group). The muscle-select stage has a 3D model (`#wheel3dContainer`,
driven by `wheel3d.js`) that spins for feel when dragged and highlights
individual parts on hover/tap — see "The muscle-select stage's 3D model"
below — plus a row of plain buttons underneath (`#musclePickRow`, built
by `buildMusclePickRow()`) that also pick the muscle group as a fallback:
clicking one (or tapping a recognized 3D part) calls
`confirmMuscleSelection(m)`, which commits `m` to `state.logMuscleFilter`
and reveals `#logMainStage`. A 2D spinning-dial picker (drag-to-rotate
through 6 muscle images, tap the centered one to confirm, no 3D model at
all) filled this role before the 3D model existed; its code (written for
the pre-Vite single-`index.html` layout, so the paste-back instructions
are stale, but the logic itself is still valid) is preserved in
`legacy/muscle-wheel-2d-backup.md` in case it's ever needed again.
`#logMainStage` itself is a plain form: `buildExerciseBlocks()` renders
one `.exercise-block` per visible exercise (name + muscle-colored left
border, no images or icons), each with one or more `.set-row`s
(weight/reps inputs, "+ Add set" next to the exercise name via
`addSetRow()`), and a single "Log workout" button (`logWorkout()`)
batches every filled row across every visible block into one save —
nothing is saved per-keystroke or per-row. `jumpToExercise()`
(`suggested-tab.js`) explicitly skips `#muscleSelectStage`, broadens
`state.logMuscleFilter` to show every exercise, then scrolls to and
flashes the target block. The muscle filter chips above the block list
(`buildMuscleFilterRow()`) follow an isolate/add/toggle-off pattern: from
"All", clicking a muscle isolates it; clicking a different muscle adds it
to the selection; re-clicking an already-active muscle removes it; the
"All" chip is the only way to jump straight back to showing everything.

**The muscle-select stage's 3D model** (`wheel3d.js`) tries
`/models/muscle-select.glb` first via `GLTFLoader` — the fast path, small
file, no extra decoder download, and what's currently in place — and
silently falls back to `/models/human.3dm`, the raw Rhino file, loaded
via Three.js's `Rhino3dmLoader` (backed by the `rhino3dm` WASM decoder,
pulled from a CDN at runtime — unlike the rest of Three.js, which is a
real npm dependency here, `rhino3dm` isn't, since it's loaded as a WASM
binary via `setLibraryPath()` at runtime, not imported as a module) if no
`.glb` exists. Both files are served from `public/models/` — see "Module
map" above. It exposes exactly three methods on `window.IronLogWheel3D`
— `show(container)`, `hide()`, `resize()` — a plain global rather than an
ES export, since it's the one piece of the app driving a raw WebGL canvas
instead of the `state.js`-backed DOM: `show()` lazily creates the
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
color from `MUSCLE_GLOW_COLOR`, a hand-kept-in-sync duplicate of
`MUSCLE_COLORS` — no scale change, an earlier version scaled the hovered
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
how to tune `HOVER_EMISSIVE_INTENSITY`/`MUSCLE_GLOW_COLOR`) are in
`models/README.md`. Unnamed or unmatched geometry renders normally but is
inert — this degrades gracefully, so a model with no recognized parts at
all just isn't interactive yet, not broken.

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

**The header's subtitle is the "curiosity" fun fact, not a static
tagline** (`fun-fact.js`). `renderFunFact()` writes directly into
`header.top .sub` (`id="funFact"`) — there's no separate boxed fun-fact
element. The comparisons it picks from (`public/data/comparisons.txt`,
`label|weight_in_kg` per line) are the user-editable "stats surpassed"
file — thresholds and labels can be edited freely and take effect on next
load with no code changes, since `loadComparisons()` just re-parses the
file and `renderFunFact()` filters by `stats.totalVolume >= c.kg`.

**The gate** (`gate.js`; `GATE_ENABLED` in `state.js`, currently `true` by
default in this repo — see the note in "What this is" about disabling it
before a public deploy): when on, `bootstrap()` (not `init()`, in
`main.js`) is the
`DOMContentLoaded` entry point. It shows `#gateScreen` — a 20×20 grid of
decorative figurine buttons — until either the `ironlog:ownerUnlocked`
localStorage flag or an active Supabase Auth session is present, then
hides the gate and calls `init()`. Clicking a cell posts to the
`verify-figurine` Edge Function (`supabase/functions/verify-figurine/`),
which is the *only* thing that ever sees the correct cell (a service-role
query against `owner_secret`, a table with no anon/authenticated RLS
policies at all). Rate limiting is enforced server-side too, via
`figurine_attempts`, not just the client's 5s cooldown timer. "I'm a
stranger" is a normal Supabase Auth email/password flow; every row in
`workout_entries`/`exercises` now carries a `user_id` — the owner's is a
fixed sentinel UUID (`OWNER_SENTINEL_ID`), not `NULL`, because Postgres
primary/unique keys can't contain NULL and `exercises` is keyed on
`(user_id, name)` so two users can both have a "Bench". **This gates the
page, not the data** — the owner's rows are still reachable by anyone
holding the public anon key, exactly as before; see the README's
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
  black/white/gray) — don't be misled by the name. `MUSCLE_COLORS` and
  `FIGURINE_COLORS` (`state.js`) are deliberate exceptions to that
  palette: muscle categories need 6 mutually distinguishable colors (a
  validated categorical set from the dataviz work), which red+mint alone
  can't provide, and the figurine grid's colors are its own derivative
  set.
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
`/auth/v1/*`, `/functions/v1/verify-figurine`, and the REST table
endpoints (`/rest/v1/...`, respond with `[]` for "no rows") with
controlled fake JSON responses.

## Status notes (for Claude's reference — trim once stale)

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
