# 3D model for the muscle-select stage

The app this model lives in is also branded/known as **Knife**
(kknniiffee.com) in its own UI.

There are two models now, one per profile — the owner and Diana each have
their own (`PROFILES.owner.modelGlb`/`.modelRhino` and
`PROFILES.diana.modelGlb`/`.modelRhino` in `src/state.js`), and
`wheel3d.js` (`src/wheel3d.js`) reads whichever pair belongs to
`activeProfile()`. For each pair, it tries the `.glb` first (the fast
path); if that doesn't exist, it falls back to the `.3dm`, the raw Rhino
file, loaded directly via Three.js's `Rhino3dmLoader` (backed by the
`rhino3dm` WASM decoder, pulled from a CDN at runtime) — no export step
needed for that path. This repo-root `models/` folder is documentation
*and* the staging area dropped-in source files land in before being
copied into `public/models/` under their real runtime names (not deployed
itself — see CLAUDE.md's "Module map"). Replacing a file in
`public/models/` is all it takes to change that profile's model; no code
changes needed unless its layer names differ from what
`modelLayerAliases` already expects (see "Making parts clickable" below).
Until a profile's files exist, you'll see a placeholder message on the
page instead of a broken/blank canvas.

**The owner's pair is fully committed**
(`public/models/muscle-select.glb`/`human.3dm`, both under GitHub's
100MB-per-file hard limit). **Diana's `.glb`
(`public/models/diana-muscle-select.glb`, ~33MB) is committed too, but
her `.3dm` isn't** — `diana-human.3dm` is ~101MB, just over that limit,
so `git push` rejects it outright (this happened for real; the commit had
to be redone without it). It still exists locally (copied from
`models/female_human.3dm` the same as everything else) and the app finds
it fine in local dev, but it isn't in the deployed build — if her `.glb`
ever failed to load in production, there'd be no `.3dm` fallback to catch
it, unlike the owner's setup. Fixing this for real needs one of: Git LFS
(a bigger, deliberate infra change — don't set this up without checking
with the user first, since it changes how the whole repo is stored and
has its own storage/bandwidth quotas), or shrinking the file below 100MB
in Rhino first (`Purge` + "Save small," see below) and replacing it.

## Loading speed

`human.3dm` is ~70MB, which made the first load slow — a raw `.3dm`
carries a lot more than the visible mesh (SubD control cages, cached
render meshes, undo history, Rhino's own file overhead), on top of which
the browser has to separately download the `rhino3dm` WASM decoder and
parse the whole thing.

`public/models/muscle-select.glb` (currently ~11MB) fixes this —
`wheel3d.js` already checks for it first on every load and uses it
automatically, falling back to the `.3dm` only if it's missing. No code
changes needed either way. Diana's `.glb` (~33MB) is meaningfully heavier
than the owner's — same fast-path behavior, but everything below about
shrinking a model applies more to hers if load time on her page ever
becomes worth trimming (doubly so for her `.3dm`, at ~101MB not even
committed to the repo — see above).

**The other big lever is polygon count**, independent of file format:
the current model has ~2 million triangles, and two single pieces account
for ~90% of that — likely a very high SubD render-mesh density. At the
size this renders on screen, tens of thousands of triangles would look
identical. Rhino's `ReduceMesh` command (quadric decimation, preserves
the silhouette) applied to the dense pieces would shrink either export
format substantially further, and also speeds up in-browser rendering,
independent of load time.

Secondary wins if working from the `.3dm`: Rhino's `Purge` command and
saving with "Save small" checked can shrink it without changing format —
worth doing for `diana-human.3dm` regardless of the git-history point
below, since it needs to drop under GitHub's 100MB file limit just to be
committable at all (see above). Committing a `.3dm` also bakes its full
size into git history permanently even after it's replaced — `human.3dm`
(~70MB) did this; worth keeping in mind for any future model too.

## Sizing / orientation / material quirks (glTF export)

`wheel3d.js` automatically centers and scales the model to a consistent
on-screen size regardless of source units/pivot. Two things needed a
one-time fix specific to *this app's* Rhino→glTF export, both already
handled in `wheel3d.js` — worth knowing about if the model ever looks
wrong again after a re-export:

- **Orientation**: the exported glTF came in lying down (Rhino's exporter
  is supposed to convert its native Z-up scene to glTF's required Y-up,
  but didn't, in practice, for this export). Fixed with a +90° X-axis
  rotation applied only on the glTF load path — the `.3dm` path doesn't
  have this problem and isn't rotated. This is now a **per-profile**
  value (`modelGltfRotateXDeg` in each `PROFILES` entry, `src/state.js`),
  not one shared constant — Diana's own export needed +180°, not +90°:
  90° alone produced a clean, well-formed pose, just one lying on her
  back looking up rather than standing upright, so a second +90° was
  needed on top. Found by live-testing candidate rotation values with the
  model's centering *recomputed at each one* — changing rotation after
  the model's one-time centering step leaves the old centering stale, so
  every value except the original looked cropped/broken until recentering
  was added to the test loop; only then did it become clear 180° (not 90°
  or -90°) was actually correct. If a future export for either profile
  comes in already upright, set that profile's value back to `0`.
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
muscle group onto a Layer (or set each object's own Name), then tell the
app which raw layer-name substrings map to which of that profile's own
muscle keys — `modelLayerAliases` in `PROFILES.owner`/`PROFILES.diana`
(`src/state.js`). For the owner this is the identity mapping (his
model's own layers are literally named `chest`/`back`/`shoulders`/`arms`/
`core`/`legs`); Diana's updated model has real `Core`/`Legs`/`Glutes`/
`Upper Body` layers — so her map is `{ upper: ["upper body"],
glutes: ["glutes"], legs: ["legs"], core: ["core"] }`. Her export also
still has a "Layer 01" node (Rhino's fallback name for anything not
assigned a real layer) — in the earlier version of her model this held
her whole unsplit upper body and was the thing `modelLayerAliases`
matched against, but the updated export moved that geometry onto its own
explicit "Upper Body" layer, so "Layer 01" now likely just holds the head
and is deliberately left unmatched (unmatched geometry still renders
normally, it's just not hoverable). Matching is case-insensitive and only
needs to *contain* the alias string (`"Chest_L"`, `"chest-01"`, etc. all
match `"chest"`). Anything left unmatched still renders normally, it's
just not hoverable/clickable.

**Figuring out a new model's actual layer names doesn't need Rhino** — a
`.glb` is just JSON plus a binary buffer, an open, fully-documented
format; reading its node names directly (e.g. a short Python/Node script
parsing the 12-byte glTF header, then the JSON chunk that follows) shows
exactly what Rhino's exporter named each layer group, without guessing or
needing rhino3dm installed. Re-export/re-save and replace whichever model
file you're using in `public/models/` under its existing runtime name —
no code changes needed unless the layer names themselves changed, in
which case update that profile's `modelLayerAliases` to match.

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
`HOVER_EMISSIVE_INTENSITY` (how strong the glow is, one constant for
both profiles) and the glow's tint per muscle, which now comes straight
from `activeProfile().muscleColors` (`state.js`, the same colors the rest
of the app's UI uses for that profile) rather than a separate hardcoded
map — `wheel3d.js` imports `state.js` for this (and for
`modelLayerAliases` above), which it deliberately didn't back when there
was only one profile's 6 static hex codes to duplicate.
