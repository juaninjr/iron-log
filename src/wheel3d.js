// Iron Log — the muscle-select stage's 3D model. A separate module (its
// own file, imported by main.js) since a Three.js scene is sizable and
// self-contained enough to be clearer split out on its own. Exposes
// window.IronLogWheel3D so log-tab.js — a plain global, since this is the
// one piece of the app that talks to a raw WebGL canvas rather than the
// rest of the DOM/state.js-driven UI — can drive it without a tighter
// coupling than it needs.
//
// The model is interactive: hovering (or, on touch, tapping without
// dragging) a recognized muscle-group part scales it up and gives it an
// emissive glow, and releasing on it fires a "musclepick" CustomEvent on
// the container element with `detail: { muscle }` — log-tab.js listens
// for that and calls confirmMuscleSelection(muscle), same as clicking
// the button row (buildMusclePickRow(), also in log-tab.js), which stays
// as a fallback. See legacy/muscle-wheel-2d-backup.md for the original 2D
// dial this replaced.
//
// Tries a glTF first — /models/muscle-select.glb (served from the
// public/ folder, see models/README.md) — since it's the fast path (a
// small binary file, no extra WASM decoder download, near-instant
// parse). If that file doesn't exist (404, the common case until one's
// been exported), silently falls back to loading the Rhino file directly
// — /models/human.3dm — via Three.js's Rhino3dmLoader (backed by the
// rhino3dm WASM decoder, loaded from CDN at runtime — unlike the rest of
// Three.js, rhino3dm isn't an npm dependency here since it's loaded as a
// WASM binary at runtime via setLibraryPath(), not imported as a module).
// The .3dm path needs no export step but is much slower to load (this
// one's ~70MB); dropping a /models/muscle-select.glb in switches to the
// fast path automatically, no code changes needed. See models/README.md
// for exporting one.
//
// Per-part hit-testing needs the model's individual SubD/mesh objects
// named after the muscle they belong to (Rhino: select the object(s),
// Properties panel, set Name to e.g. "chest" — multiple objects can
// share the same name; a Layer name works too as a fallback, see
// organizeMuscleGroups() below). Rhino3dmLoader/GLTFLoader both carry
// that Name into the resulting Mesh's `.name`; organizeMuscleGroups()
// buckets meshes by matching MUSCLE_KEYS against `.name` (case-
// insensitive substring match, so "Chest_L"/"chest-01"/etc. all still
// match "chest"). Unnamed/unmatched geometry is left alone — it renders
// normally but is neither hoverable nor clickable. See models/README.md
// for the full naming walkthrough.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Rhino3dmLoader } from "three/addons/loaders/3DMLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const GLTF_MODEL_URL = "/models/muscle-select.glb";
const RHINO_MODEL_URL = "/models/human.3dm";
// Pinned to the version the three.js r160 examples document as
// compatible with this loader — a mismatched rhino3dm version can throw
// binding errors on load (e.g. SubD mesh conversion) for models that use
// features whose native binding signature changed between versions.
const RHINO3DM_LIBRARY_PATH = "https://cdn.jsdelivr.net/npm/rhino3dm@8.0.1/";

// Must match MUSCLES / MUSCLE_COLORS in index.html — duplicated here
// (rather than imported) since wheel3d.js is a module and index.html's
// IIFE isn't, and six short hex codes aren't worth a cross-boundary
// plumbing mechanism.
const MUSCLE_KEYS = ["chest", "back", "shoulders", "arms", "core", "legs"];
const MUSCLE_GLOW_COLOR = {
  chest: 0x2a78d6,
  back: 0x1baf7a,
  shoulders: 0xeda100,
  arms: 0x008300,
  core: 0x4a3aa7,
  legs: 0xe34948,
};

const HOVER_EMISSIVE_INTENSITY = 0.7;
const DRAG_CANCEL_PX = 6;

let renderer = null;
let scene = null;
let camera = null;
let model = null;
let container = null;
let animationId = null;
let running = false;

let dragging = false;
let moved = false;
let lastX = 0;
let downX = 0;
let downY = 0;
let rotY = 0;
let velocity = 0;

// key -> THREE.Group holding that muscle's meshes (only populated for
// keys the model actually has named parts for).
let muscleGroups = {};
let hoveredKey = null;
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

function setMessage(el, message){
  let p = el.querySelector(".wheel3d-message");
  if(!p){
    p = document.createElement("p");
    p.className = "wheel3d-message";
    p.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;color:#8a8a8a;font-family:\"Helvetica Neue\",Helvetica,Arial,system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;font-size:0.85rem;pointer-events:none;";
    el.appendChild(p);
  }
  p.textContent = message;
}

function clearMessage(el){
  const p = el.querySelector(".wheel3d-message");
  if(p) p.remove();
}

// Buckets every named mesh into a per-muscle THREE.Group (reparented via
// attach(), which preserves each mesh's world transform), positioned at
// that bucket's own combined bounding-box center — so scaling the group
// for the hover effect grows it around its own middle, not the model's
// origin or the world origin.
//
// Matches, in order: the mesh's own Name; any ANCESTOR node's Name, all
// the way up to `root` (this is what actually carries a Rhino Layer
// through a glTF export — Rhino's glTF exporter turns each layer into a
// named parent Group wrapping that layer's objects, rather than naming
// the meshes themselves, which are often auto-split into many small
// unnamed primitives); and finally, .3dm-only, the mesh's Rhino Layer
// name directly (Rhino3dmLoader stores each mesh's full Rhino attributes
// — including layerIndex — in `.userData.attributes`, and the root
// object's `.userData.layers` has the layer name list). See
// models/README.md.
function organizeMuscleGroups(root){
  const layers = root.userData && root.userData.layers;

  function layerNameFor(obj){
    if(!layers) return "";
    const attrs = obj.userData && obj.userData.attributes;
    const idx = attrs && attrs.layerIndex;
    const layer = (typeof idx === "number" && idx >= 0) ? layers[idx] : null;
    return layer && layer.name ? layer.name : "";
  }

  function ancestorNameMatch(obj){
    let p = obj;
    while(p && p !== root.parent){
      const lname = (p.name || "").toLowerCase();
      const key = MUSCLE_KEYS.find(k => lname.includes(k));
      if(key) return key;
      p = p.parent;
    }
    return null;
  }

  const buckets = {};
  MUSCLE_KEYS.forEach(k => { buckets[k] = []; });

  root.traverse(obj => {
    if(!obj.isMesh) return;
    let key = ancestorNameMatch(obj);
    if(!key){
      const llayer = layerNameFor(obj).toLowerCase();
      if(llayer) key = MUSCLE_KEYS.find(k => llayer.includes(k));
    }
    if(key) buckets[key].push(obj);
  });

  root.updateMatrixWorld(true);
  // Bake each fragment's transform relative to `root`, not the world —
  // the merged replacement gets reparented as a child of `root` below,
  // so it needs to end up in `root`'s own local space (world space would
  // double up whatever transform `root` itself carries, and — more
  // importantly — would leave the merged parts unable to rotate together
  // with `root` at all, since they'd sit outside its hierarchy).
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

  MUSCLE_KEYS.forEach(key => {
    const meshes = buckets[key];
    if(meshes.length === 0) return;

    // Merge every fragment into a single mesh per muscle group. Rhino/
    // glTF exports commonly fragment one logical body part into hundreds
    // or thousands of tiny mesh primitives (this app has seen a model
    // with 4000+ pieces total) — raycasting against that many individual
    // objects on every pointer move is far too slow for interactive
    // hover (measured: ~1s per raycast, making the model unusably
    // laggy), and it's also needlessly many draw calls per frame.
    const pieceGeometries = meshes.map(m => {
      const g = m.geometry.clone();
      const localMatrix = new THREE.Matrix4().multiplyMatrices(rootInverse, m.matrixWorld);
      g.applyMatrix4(localMatrix);
      // Merge only needs position + normal — drop anything else so
      // pieces with mismatched attribute sets (e.g. some with UVs, some
      // without) can still merge instead of silently failing.
      Object.keys(g.attributes).forEach(name => {
        if(name !== "position" && name !== "normal") g.deleteAttribute(name);
      });
      if(!g.attributes.normal) g.computeVertexNormals();
      return g;
    });
    const merged = mergeGeometries(pieceGeometries, false);
    pieceGeometries.forEach(g => g.dispose());

    const baseMaterial = Array.isArray(meshes[0].material) ? meshes[0].material[0] : meshes[0].material;
    const material = baseMaterial.clone();

    // The originals are now fully represented by `merged` — remove them
    // so they're not still rendered (and raycastable) alongside it.
    meshes.forEach(m => {
      if(m.parent) m.parent.remove(m);
      m.geometry.dispose();
    });

    // Recenter the merged geometry on its own bounding-box center (data
    // is in `root`-local space from the bake above), then park the
    // wrapping group at that center — this is what makes the hover glow
    // (and any future scale effect) center on the part itself rather
    // than the model's or world origin.
    merged.computeBoundingBox();
    const center = merged.boundingBox.getCenter(new THREE.Vector3());
    merged.translate(-center.x, -center.y, -center.z);

    const mesh = new THREE.Mesh(merged, material);
    const group = new THREE.Group();
    group.name = "muscle-group-" + key;
    group.position.copy(center);
    group.add(mesh);
    root.add(group);

    muscleGroups[key] = group;
  });
}

function allTrackedMeshes(){
  const meshes = [];
  Object.values(muscleGroups).forEach(g => g.traverse(o => { if(o.isMesh) meshes.push(o); }));
  return meshes;
}

function muscleKeyForMesh(mesh){
  let p = mesh;
  while(p){
    if(p.name && p.name.startsWith("muscle-group-")) return p.name.slice("muscle-group-".length);
    p = p.parent;
  }
  return null;
}

function applyHighlight(mat, key, on){
  if(!mat || !mat.emissive) return; // material type doesn't support emissive (e.g. basic) — scale-only highlight
  if(!mat.userData) mat.userData = {};
  if(!mat.userData.baseEmissive){
    mat.userData.baseEmissive = mat.emissive.clone();
    mat.userData.baseEmissiveIntensity = mat.emissiveIntensity ?? 1;
  }
  if(on){
    mat.emissive.setHex(MUSCLE_GLOW_COLOR[key] ?? 0xffffff);
    mat.emissiveIntensity = HOVER_EMISSIVE_INTENSITY;
  } else {
    mat.emissive.copy(mat.userData.baseEmissive);
    mat.emissiveIntensity = mat.userData.baseEmissiveIntensity;
  }
}

function setHighlighted(key, on){
  const group = muscleGroups[key];
  if(!group) return;
  group.traverse(obj => {
    if(!obj.isMesh || !obj.material) return;
    if(Array.isArray(obj.material)) obj.material.forEach(m => applyHighlight(m, key, on));
    else applyHighlight(obj.material, key, on);
  });
}

function setHoveredKey(key){
  if(key === hoveredKey) return;
  if(hoveredKey) setHighlighted(hoveredKey, false);
  hoveredKey = key;
  if(hoveredKey) setHighlighted(hoveredKey, true);
  if(container) container.style.cursor = hoveredKey ? "pointer" : "grab";
}

function raycastAt(clientX, clientY){
  if(!container || !camera) return null;
  const rect = container.getBoundingClientRect();
  if(rect.width === 0 || rect.height === 0) return null;
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(allTrackedMeshes(), false);
  return hits.length > 0 ? muscleKeyForMesh(hits[0].object) : null;
}

// Rhino's own glTF exporter is expected to convert its native Z-up scene
// into glTF's required Y-up convention, but in practice (this app's own
// export) it doesn't — the model comes in lying down, as if the Z-up
// data were reinterpreted as Y-up without rotating it. The .3dm path
// (Rhino3dmLoader) doesn't have this problem. Rather than guess forever,
// this is one fixed correction applied only to the glTF path; if a
// different export ever comes in right-side-up on its own, drop this to
// 0.
const GLTF_ROTATE_X_DEG = 90;

// Neither export path assigns the body a real material: Rhino's glTF
// export leaves objects with no material explicitly assigned, which
// comes through as a black, fully-metallic PBR material (under this
// scene's simple two-light setup that reflects almost no light back to
// the camera, rendering as a solid black silhouette); the .3dm path's
// own unassigned-material default renders as a flat neutral grey
// instead. Both are grayscale (r≈g≈b), so one check catches both and
// swaps in a white, non-metallic default — the directional light still
// carves out visible shading across the form, it's just not tinted gray
// anymore. Anything with an actual assigned (non-grayscale) color is
// left untouched.
function sanitizeMaterials(root){
  const seen = new Set();
  root.traverse(obj => {
    if(!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(mat => {
      if(seen.has(mat) || !mat.color) return;
      seen.add(mat);
      const { r, g, b } = mat.color;
      const isGrayscale = Math.abs(r - g) < 0.05 && Math.abs(g - b) < 0.05;
      if(isGrayscale){
        mat.color.setHex(0xffffff);
        mat.metalness = 0;
        mat.roughness = 0.55;
      }
    });
  });
}

function onModelReady(el, object, rotateXDeg){
  // Two nested objects, not one: `content` gets the one-time orientation
  // fix (and scale/centering) baked into its transform and is never
  // touched again; `model` — the thing animate() actually spins — only
  // ever has its own .rotation.y written to, every frame, for the rest
  // of the session. Doing both on the same object doesn't work: Three's
  // Euler angles compose in a fixed axis order, so writing .rotation.y
  // on an object that also has a fixed .rotation.x looks like it's
  // spinning around some tilted, wrong axis (it is — its LOCAL Y axis
  // after the X correction, not world-space up) rather than a clean
  // turntable rotation.
  const content = object;
  if(rotateXDeg) content.rotation.x = rotateXDeg * Math.PI / 180;
  // Scale first, then recompute the box and recenter — position is
  // applied in the *scaled* object's parent space, so centering with a
  // pre-scale box's center would offset it by the wrong amount
  // (everything except the scale factor's worth would be left over).
  const rawBox = new THREE.Box3().setFromObject(content);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
  content.scale.setScalar(3 / maxDim);
  const scaledBox = new THREE.Box3().setFromObject(content);
  content.position.sub(scaledBox.getCenter(new THREE.Vector3()));

  model = new THREE.Group();
  model.add(content);
  scene.add(model);

  sanitizeMaterials(content);
  organizeMuscleGroups(content); // reparents merged muscle-group meshes under `content`, so they spin with everything else
  clearMessage(el);
}

function loadRhino(el){
  const loader = new Rhino3dmLoader();
  loader.setLibraryPath(RHINO3DM_LIBRARY_PATH);
  loader.load(
    RHINO_MODEL_URL,
    (object) => onModelReady(el, object),
    undefined,
    (err) => {
      console.error("IronLogWheel3D: could not load", RHINO_MODEL_URL, err);
      setMessage(el, "3D model failed to load — check public/models/human.3dm or public/models/muscle-select.glb exist (see models/README.md).");
    }
  );
}

function ensureScene(el){
  if(renderer) return; // already built once — show()/hide() just start/stop it

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  el.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.3));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
  dirLight.position.set(3, 4, 5);
  scene.add(dirLight);

  setMessage(el, "Loading 3D model…");

  // Fast path first: a glTF export, if one exists, loads in a fraction
  // of the time (small binary file, no rhino3dm WASM download). Falls
  // back to the raw Rhino file silently — a missing .glb is the expected
  // case until one's been exported, not a real error.
  new GLTFLoader().load(
    GLTF_MODEL_URL,
    (gltf) => onModelReady(el, gltf.scene, GLTF_ROTATE_X_DEG),
    undefined,
    () => loadRhino(el)
  );

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onHoverMove);
  el.addEventListener("pointerleave", () => setHoveredKey(null));
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onPointerUp);
}

function onPointerDown(evt){
  dragging = true;
  moved = false;
  lastX = evt.clientX;
  downX = evt.clientX;
  downY = evt.clientY;
  velocity = 0;
  // Seed hover state from the touch/click point itself — touch devices
  // never fire a hover-only pointermove before this.
  setHoveredKey(raycastAt(evt.clientX, evt.clientY));
}

// Hover-only tracking (button not held) — independent of the drag
// listener below, which only runs while dragging is true.
function onHoverMove(evt){
  if(dragging) return;
  setHoveredKey(raycastAt(evt.clientX, evt.clientY));
}

function onDragMove(evt){
  if(!dragging) return;
  const dx = evt.clientX - lastX;
  lastX = evt.clientX;
  if(Math.abs(evt.clientX - downX) > DRAG_CANCEL_PX || Math.abs(evt.clientY - downY) > DRAG_CANCEL_PX){
    moved = true;
    // Once it's a genuine drag (not a tap), the cursor should read as
    // "grabbing" regardless of whatever part it started on — the inline
    // style set by hover tracking would otherwise block CSS's
    // `.wheel3d-wrap:active` rule from ever showing, since inline styles
    // always win.
    if(container) container.style.cursor = "grabbing";
  }
  velocity = dx * 0.012;
  rotY += velocity;
}

function onPointerUp(evt){
  if(!dragging) return;
  dragging = false;
  // A plain tap (no drag) on a recognized part picks that muscle —
  // dispatched as a DOM event since index.html's IIFE isn't a module and
  // can't import this file directly.
  if(!moved && hoveredKey && container){
    container.dispatchEvent(new CustomEvent("musclepick", { detail: { muscle: hoveredKey }, bubbles: true }));
  }
  if(container) container.style.cursor = hoveredKey ? "pointer" : "grab";
}

function animate(){
  animationId = requestAnimationFrame(animate);
  if(!dragging){
    velocity *= 0.94; // momentum decay after a drag...
    if(Math.abs(velocity) < 0.0015) velocity = 0.003; // ...settling to a slow idle spin
    rotY += velocity;
  }
  if(model) model.rotation.y = rotY;
  if(renderer && scene && camera) renderer.render(scene, camera);
}

function doResize(){
  if(!container || !renderer || !camera) return;
  const w = container.clientWidth || 1;
  const h = container.clientHeight || 1;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function show(el){
  container = el;
  ensureScene(el);
  doResize();
  if(!running){
    running = true;
    animate();
  }
}

function hide(){
  running = false;
  if(animationId) cancelAnimationFrame(animationId);
  animationId = null;
  setHoveredKey(null);
}

function resize(){
  doResize();
}

window.IronLogWheel3D = { show, hide, resize };
