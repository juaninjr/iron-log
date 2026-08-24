// ---------- Gate: figurine grid + stranger auth ----------
import {
  state, useSupabase, supabaseClient, GATE_ENABLED, OWNER_UNLOCK_KEY,
  FIGURINE_COLORS, FIGURINE_IMAGES,
} from "./state.js";
import { $, $all } from "./dom-utils.js";
import { init } from "./main.js";

function figurineSvg(shape, color) {
  const decorations = [
    "",
    '<circle cx="50" cy="8" r="5" fill="currentColor"/>',
    '<path d="M28,22 L20,10 M72,22 L80,10" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/>',
    '<rect x="30" y="78" width="10" height="14" rx="5" fill="currentColor"/><rect x="60" y="78" width="10" height="14" rx="5" fill="currentColor"/>',
  ];
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" style="color:${color}" aria-hidden="true">
    <ellipse cx="50" cy="52" rx="34" ry="30" fill="currentColor"/>
    ${decorations[shape % decorations.length]}
    <circle cx="38" cy="46" r="6" fill="#fff"/>
    <circle cx="62" cy="46" r="6" fill="#fff"/>
    <circle cx="38" cy="46" r="2.5" fill="#222"/>
    <circle cx="62" cy="46" r="2.5" fill="#222"/>
  </svg>`;
}

function figurineImg(src) {
  return `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;" loading="lazy">`;
}

// Swap the gate's decorative art to PNGs later by just filling in
// FIGURINE_IMAGES (state.js) — this picks a random one and renders an
// <img> instead of generating SVG. onFigurineClick() only ever sees the
// cell's grid index, never how it was drawn, so this is the only thing
// to touch.
function renderFigurineCell() {
  if (FIGURINE_IMAGES.length > 0) {
    const src = FIGURINE_IMAGES[Math.floor(Math.random() * FIGURINE_IMAGES.length)];
    return figurineImg(src);
  }
  const shape = Math.floor(Math.random() * 4);
  const color = FIGURINE_COLORS[Math.floor(Math.random() * FIGURINE_COLORS.length)];
  return figurineSvg(shape, color);
}

export function buildFigurineGrid() {
  const grid = $("#figurineGrid");
  grid.innerHTML = "";
  for (let i = 0; i < 400; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "figurine-cell";
    cell.innerHTML = renderFigurineCell();
    cell.addEventListener("click", () => onFigurineClick(i));
    grid.appendChild(cell);
  }
}

function setGridDisabled(disabled) {
  $all(".figurine-cell", $("#figurineGrid")).forEach(c => { c.disabled = disabled; });
}

function startGateCooldown() {
  const el = $("#gateCooldown");
  let remaining = 5;
  el.hidden = false;
  el.textContent = `Try again in ${remaining}s`;
  const iv = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(iv);
      el.hidden = true;
      setGridDisabled(false);
      state.gateLocked = false;
    } else {
      el.textContent = `Try again in ${remaining}s`;
    }
  }, 1000);
}

async function onFigurineClick(cell) {
  if (state.gateLocked) return;
  state.gateLocked = true;
  setGridDisabled(true);
  try {
    const { data, error } = await supabaseClient.functions.invoke("verify-figurine", { body: { cell } });
    if (error) throw error;
    if (data && data.granted) {
      localStorage.setItem(OWNER_UNLOCK_KEY, "true");
      enterApp();
      return;
    }
  } catch (e) {
    console.error("Figurine verify error", e);
  }
  startGateCooldown();
}

function setStrangerMode(mode) {
  state.strangerMode = mode;
  $("#strangerSignInTab").classList.toggle("active", mode === "signin");
  $("#strangerSignUpTab").classList.toggle("active", mode === "signup");
  $("#strangerSubmitBtn").textContent = mode === "signin" ? "Sign in" : "Sign up";
}

function showStrangerAuth() {
  $("#gateGridView").hidden = true;
  $("#strangerAuth").hidden = false;
}
function showFigurineGrid() {
  $("#strangerAuth").hidden = true;
  $("#gateGridView").hidden = false;
}

async function handleStrangerSubmit(evt) {
  evt.preventDefault();
  const email = $("#strangerEmail").value.trim();
  const password = $("#strangerPassword").value;
  const errEl = $("#strangerError");
  errEl.hidden = true;
  try {
    const authFn = state.strangerMode === "signin" ? "signInWithPassword" : "signUp";
    const { data, error } = await supabaseClient.auth[authFn]({ email, password });
    if (error) throw error;
    if (state.strangerMode === "signup" && !data.session) {
      errEl.textContent = "Check your email to confirm your account, then sign in.";
      errEl.hidden = false;
      return;
    }
    state.currentSession = data.session;
    enterApp();
  } catch (err) {
    errEl.textContent = (err && err.message) || "Something went wrong.";
    errEl.hidden = false;
  }
}

export async function logOut() {
  if (state.currentSession) await supabaseClient.auth.signOut();
  localStorage.removeItem(OWNER_UNLOCK_KEY);
  location.reload();
}

function enterApp() {
  $("#gateScreen").hidden = true;
  $(".wrap").hidden = false;
  init();
}

function wireGateEvents() {
  $("#strangerBtn").addEventListener("click", showStrangerAuth);
  $("#strangerBackBtn").addEventListener("click", showFigurineGrid);
  $("#strangerSignInTab").addEventListener("click", () => setStrangerMode("signin"));
  $("#strangerSignUpTab").addEventListener("click", () => setStrangerMode("signup"));
  $("#strangerForm").addEventListener("submit", handleStrangerSubmit);
}

export async function bootstrap() {
  if (!useSupabase || !GATE_ENABLED) {
    await init();
    return;
  }

  if (localStorage.getItem(OWNER_UNLOCK_KEY) === "true") {
    await init();
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    state.currentSession = data.session;
    await init();
    return;
  }

  $(".wrap").hidden = true;
  $("#gateScreen").hidden = false;
  buildFigurineGrid();
  wireGateEvents();
}
