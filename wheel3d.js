// Iron Log — the muscle-select stage's 3D model. Loaded as a module
// script (see the <script type="importmap"> / <script type="module">
// tags in index.html's <head>) rather than inlined into the main IIFE,
// since a Three.js scene is sizable and self-contained enough to be
// clearer split out on its own. Exposes window.IronLogWheel3D so
// index.html's plain-script IIFE can drive it without needing to be a
// module itself.
//
// The model is purely decorative here: it spins when dragged (and idles
// with a slow auto-spin when left alone) but doesn't drive muscle-group
// selection — that still happens through the button row built by
// buildMusclePickRow() in index.html. See legacy/muscle-wheel-2d-backup.md
// for the previous 2D dial this replaced.
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

import * as THREE from "three";
import { Rhino3dmLoader } from "three/addons/loaders/3DMLoader.js";

const MODEL_URL = "models/human.3dm";
// Pinned to the version the three.js r160 examples document as
// compatible with this loader — a mismatched rhino3dm version can throw
// binding errors on load (e.g. SubD mesh conversion) for models that use
// features whose native binding signature changed between versions.
const RHINO3DM_LIBRARY_PATH = "https://cdn.jsdelivr.net/npm/rhino3dm@8.0.1/";

let renderer = null;
let scene = null;
let camera = null;
let model = null;
let container = null;
let animationId = null;
let running = false;

let dragging = false;
let lastX = 0;
let rotY = 0;
let velocity = 0;

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
      clearMessage(el);
    },
    undefined,
    (err) => {
      console.error("IronLogWheel3D: could not load", MODEL_URL, err);
      setMessage(el, "3D model failed to load — check models/human.3dm exists (see models/README.md).");
    }
  );

  el.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

function onPointerDown(evt){
  dragging = true;
  lastX = evt.clientX;
  velocity = 0;
}
function onPointerMove(evt){
  if(!dragging) return;
  const dx = evt.clientX - lastX;
  lastX = evt.clientX;
  velocity = dx * 0.012;
  rotY += velocity;
}
function onPointerUp(){
  dragging = false;
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
}

function resize(){
  doResize();
}

window.IronLogWheel3D = { show, hide, resize };
