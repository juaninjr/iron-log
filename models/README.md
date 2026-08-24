# 3D model for the muscle-select stage

`wheel3d.js` loads `models/human.3dm` **directly** — your raw Rhino file,
no export step needed — via Three.js's `Rhino3dmLoader` (backed by the
`rhino3dm` WASM decoder, pulled from a CDN at runtime). Replacing that
file is all it takes to change the model; no code changes needed. Until
the file exists, you'll see a placeholder message on the page instead of
a broken/blank canvas.

## The size/performance tradeoff

`human.3dm` as currently dropped in is **~70MB**. A raw `.3dm` is much
bigger than an equivalent glTF for the same visible mesh (NURBS + Rhino's
own file overhead vs. a web-optimized binary mesh format), which means:

- **Slow first load.** Every visitor downloads and WASM-parses the full
  70MB before the model appears (a loading placeholder covers this, but
  it can still take several seconds, more on a slow connection or older
  device).
- **Permanent git bloat.** Once committed, that 70MB stays in the repo's
  history forever, even if the file is later replaced or deleted.

This is fine for local development / previewing the feature. Before
shipping it for real, consider exporting a glTF instead:

1. In Rhino, select the geometry, then **File → Export Selected…**
2. Choose **glTF** as the file type, save as **`.glb`** (single binary
   file, simplest to drop in — no separate `.bin`/texture files).
3. Save it as `models/muscle-select.glb`.
4. Ask for `wheel3d.js` to be pointed at that file with `GLTFLoader`
   instead of `Rhino3dmLoader` + `models/human.3dm` — it's a small,
   mechanical swap (both loaders resolve to the same centered/scaled
   `Object3D`-like result, so the rest of the file doesn't change).

A glTF export of the same geometry is typically a fraction of the `.3dm`
size, loads near-instantly, and doesn't need the extra `rhino3dm` WASM
download at all.

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

To make a part recognized:

1. In Rhino, select every SubD/mesh object that belongs to one muscle
   group (e.g. all the pieces making up the chest).
2. Open the **Properties** panel (`Properties` command or F3) and set the
   **Name** field to one of: `chest`, `back`, `shoulders`, `arms`, `core`,
   `legs`. Multiple objects can share the exact same name — do this for
   every piece in that group.
3. Repeat for the other muscle groups. Anything left unnamed (or named
   something that doesn't match) still renders normally, it's just not
   hoverable/clickable.
4. Save/export and replace `models/human.3dm` with the updated file. No
   code changes needed — `wheel3d.js` reads each mesh's name at load time
   (case-insensitive, and it only needs to *contain* the muscle word, so
   `"Chest_L"`, `"chest-01"`, etc. all still match `"chest"`).

This relies on Rhino3dmLoader carrying each object's Rhino Name into the
loaded mesh's `.name` — confirmed working against three.js r160's loader.
If you ever switch to a glTF export instead (see above), the equivalent
step there is naming each **node/group** in Rhino's glTF export the same
way; `wheel3d.js`'s `organizeMuscleGroups()` would need pointing at
`GLTFLoader`'s result the same way it already reads `Rhino3dmLoader`'s.

## Tuning the hover effect

In `wheel3d.js`: `HOVER_SCALE` (how much bigger a hovered part gets),
`HOVER_EMISSIVE_INTENSITY` (how strong the glow is), and
`MUSCLE_GLOW_COLOR` (the glow's tint per muscle — currently matches this
app's `MUSCLE_COLORS` palette in `index.html`, kept in sync by hand since
`wheel3d.js` is a separate module and can't import from the non-module
main script).
