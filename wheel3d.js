// Iron Log — the muscle-select stage's 3D model. Loaded as a module
// script (see the <script type="importmap"> / <script type="module">
// tags in index.html's <head>) rather than inlined into the main IIFE,
// since a Three.js scene is sizable and self-contained enough to be
// clearer split out on its own. Exposes window.IronLogWheel3D so
// index.html's plain-script IIFE can drive it without needing to be a
// module itself.
//
// The model is interactive: hovering (or, on touch, tapping without
// dragging) a recognized muscle-group part scales it up and gives it an
// emissive glow, and releasing on it fires a "musclepick" CustomEvent on
// the container element with `detail: { muscle }` — index.html listens
// for that and calls confirmMuscleSelection(muscle), same as clicking
// the button row. The button row (buildMusclePickRow() in index.html)
// stays as a fallback — see legacy/muscle-wheel-2d-backup.md for the
// original 2D dial this replaced.
//
// Loads the Rhino file directly — models/human.3dm — via Three.js's
// Rhino3dmLoader (backed by the rhino3dm WASM decoder, loaded from CDN),
// so no manual export step is needed. NOTE: a raw .3dm is much bigger
// than an equivalent glTF for the same visible mesh (this one is ~70MB),
// which means a genuinely slow first load and a large file permanently
// baked into git history once committed. If load time or repo size
// becomes a problem, export a glTF (.glb) from Rhino instead (File >
// Export Selected > glTF) and point MODEL_URL at that — GLTFLoader is
// already used elsewhere in the three.js ecosystem the same way and
// would swap in as a straight replacement below.
//
// Per-part hit-testing needs the Rhino file's individual SubD/mesh
// objects named after the muscle they belong to (Rhino: select the
// object(s), Properties panel, set Name to e.g. "chest" — multiple
// objects can share the same name). Rhino3dmLoader carries each object's
// Rhino Name into the resulting Mesh's `.name`; organizeMuscleGroups()
// below buckets meshes by matching MUSCLE_KEYS against `.name`
// (case-insensitive substring match, so "Chest_L"/"chest-01"/etc. all
// still match "chest"). Unnamed/unmatched geometry is left alone — it
// renders normally but is neither hoverable nor clickable. See
// models/README.md for the full naming walkthrough.

import * as THREE from "three";
import { Rhino3dmLoader } from "three/addons/loaders/3DMLoader.js";

const MODEL_URL = "models/human.3dm";
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

const HOVER_SCALE = 1.15;
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
    p.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;color:#8a8a8a;font-family:Karrik,sans-serif;font-size:0.85rem;pointer-events:none;";
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
function organizeMuscleGroups(root){
  const buckets = {};
  MUSCLE_KEYS.forEach(k => { buckets[k] = []; });

  root.traverse(obj => {
    if(!obj.isMesh) return;
    const lname = (obj.name || "").toLowerCase();
    const key = MUSCLE_KEYS.find(k => lname.includes(k));
    if(key) buckets[key].push(obj);
  });

  MUSCLE_KEYS.forEach(key => {
    const meshes = buckets[key];
    if(meshes.length === 0) return;

    const box = new THREE.Box3();
    meshes.forEach(m => box.expandByObject(m));
    const center = box.getCenter(new THREE.Vector3());

    const group = new THREE.Group();
    group.name = "muscle-group-" + key;
    group.position.copy(center);
    scene.add(group);
    meshes.forEach(m => group.attach(m));

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

function setHighlighted(key, on){
  const group = muscleGroups[key];
  if(!group) return;
  group.scale.setScalar(on ? HOVER_SCALE : 1);
  group.traverse(obj => {
    if(!obj.isMesh || !obj.material) return;
    const mat = obj.material;
    if(!mat.emissive) return; // material type doesn't support emissive (e.g. basic) — scale-only highlight
    if(!obj.userData.baseEmissive){
      obj.userData.baseEmissive = mat.emissive.clone();
      obj.userData.baseEmissiveIntensity = mat.emissiveIntensity ?? 1;
    }
    if(on){
      mat.emissive.setHex(MUSCLE_GLOW_COLOR[key] ?? 0xffffff);
      mat.emissiveIntensity = HOVER_EMISSIVE_INTENSITY;
    } else {
      mat.emissive.copy(obj.userData.baseEmissive);
      mat.emissiveIntensity = obj.userData.baseEmissiveIntensity;
    }
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

  const loader = new Rhino3dmLoader();
  loader.setLibraryPath(RHINO3DM_LIBRARY_PATH);
  loader.load(
    MODEL_URL,
    (object) => {
      model = object;
      // Scale first, then recompute the box and recenter — position is
      // applied in the *scaled* object's parent space, so centering with
      // a pre-scale box's center would offset it by the wrong amount
      // (everything except the scale factor's worth would be left over).
      const rawBox = new THREE.Box3().setFromObject(model);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
      model.scale.setScalar(3 / maxDim);
      const scaledBox = new THREE.Box3().setFromObject(model);
      model.position.sub(scaledBox.getCenter(new THREE.Vector3()));
      scene.add(model);
      organizeMuscleGroups(model);
      clearMessage(el);
    },
    undefined,
    (err) => {
      console.error("IronLogWheel3D: could not load", MODEL_URL, err);
      setMessage(el, "3D model failed to load — check models/human.3dm exists (see models/README.md).");
    }
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
