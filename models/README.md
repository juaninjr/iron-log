# 3D model for the muscle-select stage

The app this model lives in is also branded/known as **Knife**
(kknniiffee.com) in its own UI.

`wheel3d.js` (`src/wheel3d.js`) tries `/models/muscle-select.glb` first
(the fast path, and what's currently in place); if that doesn't exist, it
falls back to `/models/human.3dm`, the raw Rhino file, loaded directly via
Three.js's `Rhino3dmLoader` (backed by the `rhino3dm` WASM decoder, pulled
from a CDN at runtime) — no export step needed for that path. Both files
live in `public/models/` (this repo-root `models/` folder is
documentation only, not deployed — see CLAUDE.md's "Module map").
Replacing either file in `public/models/` is all it takes to change the
model; no code changes needed. Until one of them exists, you'll see a
placeholder message on the page instead of a broken/blank canvas.

## Loading speed

`human.3dm` is ~70MB, which made the first load slow — a raw `.3dm`
carries a lot more than the visible mesh (SubD control cages, cached
render meshes, undo history, Rhino's own file overhead), on top of which
the browser has to separately download the `rhino3dm` WASM decoder and
parse the whole thing.

`public/models/muscle-select.glb` (currently ~11MB) fixes this —
`wheel3d.js` already checks for it first on every load and uses it
automatically, falling back to the `.3dm` only if it's missing. No code
changes needed either way.

**The other big lever is polygon count**, independent of file format:
the current model has ~2 million triangles, and two single pieces account
for ~90% of that — likely a very high SubD render-mesh density. At the
size this renders on screen, tens of thousands of triangles would look
identical. Rhino's `ReduceMesh` command (quadric decimation, preserves
the silhouette) applied to the dense pieces would shrink either export
format substantially further, and also speeds up in-browser rendering,
independent of load time.

Secondary wins if working from the `.3dm`: Rhino's `Purge` command and
saving with "Save small" checked can shrink it without changing format.
Committing `human.3dm` also bakes ~70MB into git history permanently even
after it's replaced — worth keeping in mind either way.

## Sizing / orientation / material quirks (glTF export)

`wheel3d.js` automatically centers and scales the model to a consistent
on-screen size regardless of source units/pivot. Two things needed a
one-time fix specific to *this app's* Rhino→glTF export, both already
handled in `wheel3d.js` — worth knowing about if the model ever looks
wrong again after a re-export:

- **Orientation**: the exported glTF came in lying down (Rhino's exporter
  is supposed to convert its native Z-up scene to glTF's required Y-up,
  but didn't, in practice, for this export). Fixed with a flat +90°
  X-axis rotation applied only on the glTF load path (`GLTF_ROTATE_X_DEG`
  in `wheel3d.js`) — the `.3dm` path doesn't have this problem and isn't
  rotated. If a future export comes in already upright, set that constant
  back to `0`.
- **Material**: parts with no material explicitly assigned in Rhino
  exported as pure black + fully metallic, which reflects almost no light
  under this scene's simple lighting and rendered as a solid black
  silhouette. `sanitizeMaterials()` in `wheel3d.js` detects exactly that
  degenerate combination (black color + metalness ≥ 0.9) and swaps in a
  neutral grey, non-metallic default — anything with an actually-assigned
  color is left untouched. If parts still look wrong after a re-export,
  assigning real Rhino materials/colors to those objects is the real fix;
  this is just a safety net for the common "nothing assigned" case.

## Making parts clickable

Hovering a recognized part gives it a colored glow; tapping/clicking it
(without dragging) picks that muscle directly, same as clicking the
button row underneath (which stays as a fallback — handy on touch
devices, or if a part's naming doesn't quite match).

`organizeMuscleGroups()` in `wheel3d.js` matches, in this order, for
every mesh in the model:

1. The mesh's own Name.
2. **Any ancestor node's Name**, walking all the way up to the model
   root. This is the one that actually matters for a glTF export: Rhino's
   glTF exporter turns each **Layer** into a named parent Group wrapping
   that layer's objects — the individual mesh primitives underneath are
   usually auto-split into many small, generically-named pieces (this
   model's export split into 4000+ of them), so it's the *layer's* name,
   showing up as an ancestor, that actually carries the muscle name
   through. This is exactly what makes it work for a model organized by
   Rhino Layer rather than per-object Name — you don't need to rename
   every individual object, just the layer.
3. `.3dm`-only fallback: the mesh's Rhino Layer name read directly via
   Rhino3dmLoader's attributes (no ancestor-node equivalent on that path).

To make a part recognized: in Rhino, get every SubD/mesh object for one
muscle group onto a Layer (or set each object's own Name) called one of
`chest`, `back`, `shoulders`, `arms`, `core`, `legs` — case-insensitive,
and only needs to *contain* the word (`"Chest_L"`, `"chest-01"`, etc. all
match `"chest"`). Anything left unmatched still renders normally, it's
just not hoverable/clickable. Re-export/re-save and replace whichever
model file you're using in `public/models/` — no code changes needed.

**Performance note**: a glTF export commonly fragments one logical body
part into hundreds or thousands of tiny mesh primitives (see above).
Raycasting against that many individual objects on every pointer move
measured at roughly 1 second per hover check — unusably laggy. Fixed by
merging every muscle group's fragments into a single combined mesh at
load time (`organizeMuscleGroups()`, via `BufferGeometryUtils.mergeGeometries()`)
— confirmed down to well under 1ms per raycast afterward. If you ever see
hover lag again, that merge step is the first thing to check (e.g. a
model organized in some new way that produces bucket sizes in the tens of
thousands might need it revisited).

## Tuning the hover effect

Hovering a part changes its color only (no size change — an earlier
scale-up version made parts visibly shift position, since a part's own
"center" isn't always where it visually looks centered). In `wheel3d.js`:
`HOVER_EMISSIVE_INTENSITY` (how strong the glow is) and
`MUSCLE_GLOW_COLOR` (the glow's tint per muscle — currently matches this
app's `MUSCLE_COLORS` palette in `src/state.js`, kept in sync by hand
since `wheel3d.js` doesn't import from `state.js`, to keep it a
self-contained module with no dependency on the rest of the app's state).
