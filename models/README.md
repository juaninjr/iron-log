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

## What's next

Right now the model is decorative — dragging it spins it for feel, but
picking a muscle group still happens through the button row below it.
The plan (per your last request) is to eventually split the model into
6 named parts, one per muscle group, so spinning it to face a given part
can select that muscle directly. That'll need the model's parts named
clearly (e.g. `chest`, `back`, `shoulders`, `arms`, `core`, `legs`) so the
code can find them — flag when you're ready to do that and export/save a
version with parts split out.
