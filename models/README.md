# 3D model for the muscle-select stage

`wheel3d.js` tries `models/muscle-select.glb` first (fast path — see
"Loading speed" below); if that doesn't exist, it falls back to
`models/human.3dm`, your raw Rhino file, loaded directly via Three.js's
`Rhino3dmLoader` (backed by the `rhino3dm` WASM decoder, pulled from a
CDN at runtime) — no export step needed for that path. Replacing either
file is all it takes to change the model; no code changes needed. Until
one of them exists, you'll see a placeholder message on the page instead
of a broken/blank canvas.

## Loading speed

`human.3dm` as currently dropped in is **~70MB**, which is why the first
load takes a while — a raw `.3dm` carries a lot more than the visible
mesh (SubD control cages, cached render meshes, undo history, Rhino's own
file overhead), and on top of downloading the file itself, the browser
also has to download the `rhino3dm` WASM decoder and parse the whole
thing before anything appears.

**The fix is a glTF export**, typically a fraction of the `.3dm` size and
near-instant to load (no WASM decoder needed at all):

1. In Rhino, select the geometry, then **File → Export Selected…**
2. Choose **glTF** as the file type, save as **`.glb`** (single binary
   file, simplest to drop in — no separate `.bin`/texture files).
3. Save it as `models/muscle-select.glb`.

That's it — `wheel3d.js` already checks for that file first on every
load and uses it automatically the moment it exists, falling back to the
`.3dm` only if it's missing. No code changes needed either way. The part
**naming** for hover/click (below) carries over the same way through a
glTF export, so do that step first if you haven't yet — no need to redo
it for glTF specifically.

Secondary, smaller wins if you want to keep working from the `.3dm` for
now: Rhino's `Purge` command (removes unused/orphaned data) and saving
with "Save small" checked (strips cached render meshes/history) can both
shrink a `.3dm` meaningfully without changing the export format.

Committing `human.3dm` also bakes ~70MB into git history permanently,
even after it's replaced or deleted later — another reason to move to a
`.glb` once you're happy with the model.

## Sizing / orientation

`wheel3d.js` automatically centers the model and scales it to a
consistent on-screen size, so it doesn't matter what units or pivot point
Rhino saved it with. It does NOT re-orient the model, so if it looks
sideways or upside-down on the page, rotate it in Rhino before
re-exporting (or ask for a fixed rotation offset to be added in code once
you see how it looks).

## Making parts clickable

Hovering a recognized part scales it up and gives it a colored glow;
tapping/clicking it (without dragging) picks that muscle directly, same
as clicking the button row underneath (which stays as a fallback — handy
on touch devices, or if a part's naming doesn't quite match).

To make a part recognized, **use the object's Name, not its Layer** —
Layer name is only checked as a fallback (see below), Name is what
`wheel3d.js` reads first:

1. In Rhino, select every SubD/mesh object that belongs to one muscle
   group (e.g. all the pieces making up the chest).
2. Open the **Properties** panel (`Properties` command or F3) and set the
   **Name** field to one of: `chest`, `back`, `shoulders`, `arms`, `core`,
   `legs`. Multiple objects can share the exact same name — do this for
   every piece in that group. (Note: your groups currently show up as
   Rhino's auto-generated `"Group16371"`-style names in the loaded scene —
   that's the Group ID, not a Name; you still need to set Name
   explicitly, grouping alone doesn't do it.)
3. Repeat for the other muscle groups. Anything left unnamed (or named
   something that doesn't match) still renders normally, it's just not
   hoverable/clickable.
4. Save/export and replace `models/human.3dm` (or re-export
   `models/muscle-select.glb`, once you're using that) with the updated
   file. No code changes needed — `wheel3d.js` reads each mesh's name at
   load time (case-insensitive, and it only needs to *contain* the muscle
   word, so `"Chest_L"`, `"chest-01"`, etc. all still match `"chest"`).

**If you'd rather organize by Layer instead of per-object Name** (e.g.
you already have `chest`/`back`/etc. layers and don't want to rename 22
individual objects). That works too, automatically, as a fallback — if an
object's own Name doesn't match a muscle key, `organizeMuscleGroups()` in
`wheel3d.js` checks which Rhino Layer the object is on and matches against
that layer's name instead. So naming just the *layers* is enough; you
don't need to also rename every object on them. This layer fallback only
applies to the `.3dm` path — a glTF export has no equivalent "layer"
concept, so if you switch to `.glb`, matching depends only on the
exported node/mesh Name (Rhino's glTF exporter generally carries object
Names and/or layer groupings into node names, but layer-only matching
specifically won't apply there).

## Tuning the hover effect

In `wheel3d.js`: `HOVER_SCALE` (how much bigger a hovered part gets),
`HOVER_EMISSIVE_INTENSITY` (how strong the glow is), and
`MUSCLE_GLOW_COLOR` (the glow's tint per muscle — currently matches this
app's `MUSCLE_COLORS` palette in `index.html`, kept in sync by hand since
`wheel3d.js` is a separate module and can't import from the non-module
main script).
