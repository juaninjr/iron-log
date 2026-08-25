# 2D muscle-select wheel — backup

The app this backup belongs to is also branded/known as **Knife**
(kknniiffee.com) in its own UI.

This is the full 2D "spinning dial" muscle-select picker that used to live
in `#muscleSelectStage`, before it was replaced by a 3D model
(`wheel3d.js`) plus a row of muscle-group buttons. Saved here in case the
3D version needs to be rolled back.

To restore: paste each block below back into `index.html` at roughly the
same spot it came from (noted per block), remove the 3D
stage's markup/CSS/JS it replaced, and remove the `<script type="importmap">`
/ `<script type="module" src="wheel3d.js">` tags from `<head>` if you don't
need Three.js for anything else.

## HTML (was inside `<div class="view" id="viewLog">`, replacing the current `#muscleSelectStage` contents)

```html
<div id="muscleSelectStage">
  <button type="button" class="skip-to-log-btn" id="skipToLogBtn" title="Go to exercise logging" aria-label="Go to exercise logging">🏠</button>
  <div class="wheel-wrap" id="muscleWheelWrap">
    <div class="wheel-list" id="muscleWheelList" role="listbox" aria-label="Muscle group picker" tabindex="0"></div>
  </div>
</div>
```

## CSS (was in the main `<style>` block)

```css
/* The muscle-select wheel — the only wheel in the app. A spinning dial:
   items sit 60° apart around a circle whose center is off-screen to the
   left, so only the east-facing edge is ever visible, and a full spin
   cycles all 6 muscles through the front position. Center item is big
   and sharp; its immediate neighbor is a small blurred sliver; anything
   further is both invisible and clipped by the wrap's own height. */
.wheel-wrap{
  position:relative;
  height:min(78vh, 720px);
  min-height:420px;
  overflow:hidden;
  border:1px solid var(--line);
  border-radius:16px;
  background:#ffffff;
  margin:0 -20px 6px;
  touch-action:none;
  cursor:grab;
  user-select:none;
  -webkit-user-select:none;
}
.wheel-wrap::before, .wheel-wrap::after{
  content:"";
  position:absolute;
  left:0;right:0;
  height:90px;
  pointer-events:none;
  z-index:2;
}
.wheel-wrap::before{top:0;background:linear-gradient(#ffffff, rgba(255,255,255,0));}
.wheel-wrap::after{bottom:0;background:linear-gradient(rgba(255,255,255,0), #ffffff);}
.wheel-list{
  position:absolute;
  inset:0;
  list-style:none;
  margin:0;padding:0;
}
.wheel-list:focus-visible{outline:2px solid var(--steel);outline-offset:-2px;}
.wheel-item{
  position:absolute;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:8px;
  width:min(64vw,300px);
  cursor:pointer;
  transition:transform 0.05s linear;
}
.wheel-list.snap .wheel-item{transition:left 0.28s cubic-bezier(0.2,0.7,0.3,1), top 0.28s cubic-bezier(0.2,0.7,0.3,1), transform 0.28s cubic-bezier(0.2,0.7,0.3,1), opacity 0.28s ease;}
.wheel-item .body-visual{transition:filter 0.15s ease, transform 0.15s ease;flex:none;width:min(58vw,260px);height:auto;}
.wheel-list.snap .wheel-item .body-visual{transition:filter 0.28s ease, transform 0.28s cubic-bezier(0.2,0.7,0.3,1);}
.wheel-item-name{
  font-family:'Karrik',sans-serif;
  font-weight:800;
  font-size:1.5rem;
  white-space:nowrap;
  color:var(--ink);
}
.wheel-item[aria-selected="true"] .wheel-item-name{color:var(--plate);}

/* Muscle-select stage. Header/nav are hidden while this shows (see JS);
   the only way back to them without confirming is #skipToLogBtn. No
   titles, hints, or boxed containers on purpose — just the wheel and
   the home icon. Tapping the centered (big, sharp) item confirms it
   directly — there's no separate Confirm button. */
body.muscle-gate-active{padding-top:16px;}
.skip-to-log-btn{
  display:block;
  margin:0 0 10px;
  width:44px;height:44px;
  border-radius:50%;
  border:1px solid var(--line-strong);
  background:var(--paper-raised);
  font-size:1.3rem;
  line-height:1;
  cursor:pointer;
}
#muscleSelectStage .wheel-wrap{
  height:min(88vh,880px);
  min-height:480px;
  margin:0;
  border:none;
  border-radius:0;
  background:transparent;
}
#muscleSelectStage .wheel-wrap::before,
#muscleSelectStage .wheel-wrap::after{background:none;}
```

And in the small-screen media query block:

```css
@media (max-width:400px){
  .wheel-wrap{margin:0 -14px 6px;}
  .wheel-item-name{font-size:1.05rem;}
}
```

## JS state (was near the top of the script, alongside other module-level state)

```js
const MUSCLE_WHEEL_ANGLE_STEP = 60; // degrees of arc between adjacent items
const WHEEL_MOVE_CANCEL_PX = 6;
const MUSCLE_WHEEL_ITEM_H = 280;
let muscleWheelSelectedIndex = 0;
let muscleWheelPointerActive = false;
let muscleWheelMoved = false;
let muscleWheelStartY = 0;
let muscleWheelStartIndex = 0;
let muscleWheelTapIndexAtStart = 0;
let muscleWheelLastHapticIndex = 0;
const MUSCLE_WHEEL_IMAGE = {
  chest: "images/chest.png",
  back: "images/back.png",
  shoulders: "images/shoulders.png",
  arms: "images/biceps.png",
  core: "images/core.png",
  legs: "images/leg.png",
};
```

`BODY_IMG_ASPECT` (`466 / 234`) is still used elsewhere-independent — keep
it if it still exists, it's not wheel-specific.

## JS functions (were grouped under `// ---------- Muscle-select wheel (the gate in front of the Log page) ----------`)

```js
function buildMuscleWheelItems(){
  const list = $("#muscleWheelList");
  if(!list) return;
  list.innerHTML = "";
  MUSCLES.forEach((m, i) => {
    const item = document.createElement("div");
    item.className = "wheel-item muscle-wheel-item";
    item.id = "muscle-wheel-item-" + i;
    item.dataset.index = String(i);
    item.setAttribute("role", "option");
    const w = 210, h = Math.round(w * BODY_IMG_ASPECT);
    item.innerHTML = `<img class="body-visual" src="${MUSCLE_WHEEL_IMAGE[m]}" alt="" width="${w}" height="${h}" loading="lazy"><span class="wheel-item-name">${MUSCLE_LABELS[m]}</span>`;
    list.appendChild(item);
  });
  if(muscleWheelSelectedIndex >= MUSCLES.length) muscleWheelSelectedIndex = MUSCLES.length - 1;
  updateMuscleWheelPositions(0);
}

// Repositions the dial by `dragOffset` px from muscleWheelSelectedIndex.
// Each item sweeps along the arc of a circle whose center sits
// off-screen to the left (both x AND y move together as angle changes)
// — genuine rotation, not a vertical scroll with a sideways curve —
// and only the "east" sliver of that circle is ever on-screen. The PNG
// itself is also rotated by its arc angle (mounted-on-the-rim, not
// staying upright) so it visibly spins rather than just fading in/out;
// the label stays untransformed so it's always legible.
// Opacity/blur/scale still fall off by item-distance (not angle), so
// only the centered item is ever fully visible.
function updateMuscleWheelPositions(dragOffset){
  const wrap = $("#muscleWheelWrap");
  const list = $("#muscleWheelList");
  if(!wrap || !list) return;
  const items = $all(".wheel-item", list);
  if(items.length === 0) return;

  const wrapW = wrap.clientWidth || 300;
  const wrapH = wrap.clientHeight || 500;
  const rightAnchor = wrapW - 88;
  const radius = wrapW * 0.62;
  const cx = rightAnchor - radius;
  const cy = wrapH / 2;

  const continuousIndex = muscleWheelSelectedIndex - dragOffset / MUSCLE_WHEEL_ITEM_H;

  let nearestIndex = 0, nearestAbsDist = Infinity;
  items.forEach((item, i) => {
    const signedDist = i - continuousIndex;
    const absDist = Math.abs(signedDist);
    if(absDist < nearestAbsDist){ nearestAbsDist = absDist; nearestIndex = i; }

    const angleDeg = signedDist * MUSCLE_WHEEL_ANGLE_STEP;
    const theta = angleDeg * Math.PI / 180;
    const x = cx + radius * Math.cos(theta);
    const y = cy + radius * Math.sin(theta);
    const t = clamp(1 - absDist / 1.4, 0, 1);

    item.style.left = `${x}px`;
    item.style.top = `${y}px`;
    item.style.transform = `translate(-50%, -50%) scale(${clamp(0.4 + 0.6 * t, 0.4, 1)})`;
    item.style.opacity = String(t);
    const img = item.querySelector(".body-visual");
    if(img){
      img.style.filter = `blur(${(1 - t) * 6}px)`;
      img.style.transform = `rotate(${angleDeg}deg)`;
    }
    item.setAttribute("aria-selected", "false");
  });
  const centerItem = items[nearestIndex];
  if(centerItem){
    centerItem.setAttribute("aria-selected", "true");
    list.setAttribute("aria-activedescendant", centerItem.id);
  }
}

// Full 2D nearest-center lookup — needed because items now sweep along a
// circular arc, so two items can share a Y (or X) coordinate while being
// far apart along the arc; comparing only one axis could resolve a tap
// to the wrong item.
function muscleWheelIndexFromPoint(clientX, clientY){
  const items = $all(".wheel-item", $("#muscleWheelList"));
  if(items.length === 0) return muscleWheelSelectedIndex;
  let closest = muscleWheelSelectedIndex, closestDist = Infinity;
  items.forEach((item, i) => {
    const r = item.getBoundingClientRect();
    const dx = (r.left + r.width / 2) - clientX;
    const dy = (r.top + r.height / 2) - clientY;
    const d = dx * dx + dy * dy;
    if(d < closestDist){ closestDist = d; closest = i; }
  });
  return closest;
}

function onMuscleWheelPointerDown(evt){
  muscleWheelPointerActive = true;
  muscleWheelMoved = false;
  muscleWheelStartY = evt.clientY;
  muscleWheelStartIndex = muscleWheelSelectedIndex;
  // Prefer exact DOM hit-testing (the browser already resolved which
  // element is under the pointer, transforms and all) — only fall back
  // to nearest-center math if the pointer started in the gutter between
  // items.
  const hitItem = evt.target.closest && evt.target.closest(".wheel-item");
  muscleWheelTapIndexAtStart = hitItem
    ? Number(hitItem.dataset.index)
    : muscleWheelIndexFromPoint(evt.clientX, evt.clientY);
  muscleWheelLastHapticIndex = muscleWheelSelectedIndex;

  $("#muscleWheelList").classList.remove("snap");

  window.addEventListener("pointermove", onMuscleWheelPointerMove);
  window.addEventListener("pointerup", onMuscleWheelPointerUp);
}

function onMuscleWheelPointerMove(evt){
  if(!muscleWheelPointerActive) return;
  const deltaY = evt.clientY - muscleWheelStartY;
  if(Math.abs(deltaY) > WHEEL_MOVE_CANCEL_PX) muscleWheelMoved = true;

  updateMuscleWheelPositions(deltaY);

  const nearestNow = clamp(Math.round(muscleWheelStartIndex - deltaY / MUSCLE_WHEEL_ITEM_H), 0, MUSCLES.length - 1);
  if(nearestNow !== muscleWheelLastHapticIndex){
    muscleWheelLastHapticIndex = nearestNow;
    triggerHaptic();
  }
}

// Releasing a drag just settles the dial. Releasing a plain tap either
// spins the tapped item to center, or — if it was already centered —
// confirms it. There's no separate Confirm button; the centered icon
// itself is the button.
function onMuscleWheelPointerUp(evt){
  if(!muscleWheelPointerActive) return;
  muscleWheelPointerActive = false;
  window.removeEventListener("pointermove", onMuscleWheelPointerMove);
  window.removeEventListener("pointerup", onMuscleWheelPointerUp);

  $("#muscleWheelList").classList.add("snap");

  if(muscleWheelMoved){
    const deltaY = evt.clientY - muscleWheelStartY;
    muscleWheelSelectedIndex = clamp(Math.round(muscleWheelStartIndex - deltaY / MUSCLE_WHEEL_ITEM_H), 0, MUSCLES.length - 1);
    updateMuscleWheelPositions(0);
    return;
  }
  if(muscleWheelTapIndexAtStart === muscleWheelSelectedIndex){
    confirmMuscleSelection();
  } else {
    muscleWheelSelectedIndex = muscleWheelTapIndexAtStart;
    updateMuscleWheelPositions(0);
  }
}

function onMuscleWheelKeydown(evt){
  if(evt.key === "ArrowDown"){
    evt.preventDefault();
    muscleWheelSelectedIndex = clamp(muscleWheelSelectedIndex + 1, 0, MUSCLES.length - 1);
    $("#muscleWheelList").classList.add("snap");
    updateMuscleWheelPositions(0);
  } else if(evt.key === "ArrowUp"){
    evt.preventDefault();
    muscleWheelSelectedIndex = clamp(muscleWheelSelectedIndex - 1, 0, MUSCLES.length - 1);
    $("#muscleWheelList").classList.add("snap");
    updateMuscleWheelPositions(0);
  } else if(evt.key === "Enter" || evt.key === " "){
    evt.preventDefault();
    confirmMuscleSelection();
  }
}
```

## Gate-orchestration functions (adapt back if restoring — these currently
call into wheel3d.js / the button row instead)

```js
function confirmMuscleSelection(){
  const m = MUSCLES[muscleWheelSelectedIndex];
  logMuscleFilter = new Set([m]);
  leaveMuscleGate();
  buildMuscleFilterRow();
  buildExerciseBlocks();
  render();
}

function enterMuscleGate(){
  $("#muscleSelectStage").hidden = false;
  $("#logMainStage").hidden = true;
  $("header.top").hidden = true;
  $("#mainTabs").hidden = true;
  document.body.classList.add("muscle-gate-active");
  buildMuscleWheelItems();
}
```

`leaveMuscleGate()` and `skipToLogPage()` didn't reference the wheel
directly and don't need changes to restore.

## init() wiring (was alongside the other event listener wiring)

```js
$("#muscleWheelWrap").addEventListener("pointerdown", onMuscleWheelPointerDown);
$("#muscleWheelList").addEventListener("keydown", onMuscleWheelKeydown);
```

And in the window resize handler, the log-tab branch called:

```js
resizeRaf = requestAnimationFrame(() => updateMuscleWheelPositions(0));
```
