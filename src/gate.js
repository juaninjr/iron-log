// ---------- Gate: figurine grid + Diana's Q&A gate + stranger auth ----------
import {
  state, useSupabase, supabaseClient, GATE_ENABLED, OWNER_UNLOCK_KEY,
  DIANA_UNLOCK_KEY, FIGURINE_COLORS, FIGURINE_IMAGES, activeProfile,
} from "./state.js";
import { $, $all } from "./dom-utils.js";
import { init } from "./main.js";
import { renderKnifeTitle, knifeGlyphSvg } from "./brand.js";
import { resetProfileFilters } from "./log-tab.js";

// The id of the question currently shown in #dianaQaView — ephemeral UI
// flow state, private to this module (never read elsewhere), so a plain
// module-scoped variable rather than something on state.js.
let dianaQaId = null;

function figurineImg(src) {
  return `<img src="${src}" alt="" loading="lazy">`;
}

// FIGURINE_IMAGES (state.js) is the gate's actual decorative art — this
// picks a random entry and renders an <img>, in that image's own natural
// color (no per-cell recoloring). Falls back to the hand-rolled,
// randomly-colored knife glyph (knifeGlyphSvg, brand.js) only if
// FIGURINE_IMAGES is ever emptied. onFigurineClick() only ever sees the
// cell's grid index, never how it was drawn, so this is the only thing
// to touch.
function renderFigurineCell() {
  if (FIGURINE_IMAGES.length > 0) {
    const src = FIGURINE_IMAGES[Math.floor(Math.random() * FIGURINE_IMAGES.length)];
    return figurineImg(src);
  }
  const color = FIGURINE_COLORS[Math.floor(Math.random() * FIGURINE_COLORS.length)];
  return knifeGlyphSvg(color);
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

// Shared 5s-countdown UI, reused by the grid and Diana's Q&A step — each
// caller passes its own display element and what to do once it expires.
function startCooldown(el, onExpire) {
  let remaining = 5;
  el.hidden = false;
  el.textContent = `Try again in ${remaining}s`;
  const iv = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(iv);
      el.hidden = true;
      onExpire();
    } else {
      el.textContent = `Try again in ${remaining}s`;
    }
  }, 1000);
}

function startGateCooldown() {
  startCooldown($("#gateCooldown"), () => {
    setGridDisabled(false);
    state.gateLocked = false;
  });
}

function startDianaQaCooldown() {
  $("#dianaQaAnswer").disabled = true;
  startCooldown($("#dianaQaCooldown"), () => {
    $("#dianaQaSubmitBtn").disabled = false;
    $("#dianaQaAnswer").disabled = false;
    state.dianaQaLocked = false;
  });
}

// A clicked cell can unlock either profile — the server checks both
// secrets and reports which one (if any) matched, so the client never has
// to guess or pre-select a profile before clicking. See
// supabase/functions/verify-figurine/index.ts.
async function onFigurineClick(cell) {
  if (state.gateLocked) return;
  state.gateLocked = true;
  setGridDisabled(true);
  try {
    const { data, error } = await supabaseClient.functions.invoke("verify-figurine", { body: { cell } });
    if (error) throw error;
    if (data && data.granted) {
      state.gateLocked = false;
      setGridDisabled(false);
      if (data.profile === "diana") {
        await handleDianaGranted();
      } else {
        localStorage.setItem(OWNER_UNLOCK_KEY, "true");
        enterApp("owner");
      }
      return;
    }
  } catch (e) {
    console.error("Figurine verify error", e);
  }
  startGateCooldown();
}

// Diana's cell was correct — whether she still needs the security
// question depends on the owner's toggle (diana_gate_settings, see
// loadDianaGateSetting()/setDianaGateSetting() below).
async function handleDianaGranted() {
  const gateEnabled = await loadDianaGateSetting();
  if (!gateEnabled) {
    localStorage.setItem(DIANA_UNLOCK_KEY, "true");
    enterApp("diana");
    return;
  }
  showDianaQaView();
  await fetchDianaQuestion();
}

async function fetchDianaQuestion() {
  $("#dianaQaError").hidden = true;
  try {
    const { data, error } = await supabaseClient.functions.invoke("diana-qa", { body: {} });
    if (error) throw error;
    if (!data || !data.id || !data.question) throw new Error("no question returned");
    dianaQaId = data.id;
    $("#dianaQaQuestion").textContent = data.question;
    $("#dianaQaAnswer").value = "";
    $("#dianaQaAnswer").focus();
  } catch (e) {
    console.error("Diana question fetch error", e);
    dianaQaId = null;
    $("#dianaQaQuestion").textContent = "Could not load a question.";
  }
}

async function handleDianaQaSubmit(evt) {
  evt.preventDefault();
  if (state.dianaQaLocked || !dianaQaId) return;
  const answer = $("#dianaQaAnswer").value.trim();
  if (!answer) return;
  state.dianaQaLocked = true;
  $("#dianaQaSubmitBtn").disabled = true;
  try {
    const { data, error } = await supabaseClient.functions.invoke("diana-qa", { body: { id: dianaQaId, answer } });
    if (error) throw error;
    if (data && data.granted) {
      localStorage.setItem(DIANA_UNLOCK_KEY, "true");
      enterApp("diana");
      return;
    }
  } catch (e) {
    console.error("Diana answer verify error", e);
  }
  $("#dianaQaError").textContent = "Not quite — try again.";
  $("#dianaQaError").hidden = false;
  startDianaQaCooldown(); // re-enables both the input and submit button when it expires
  await fetchDianaQuestion(); // a fresh random question for the next attempt
}

function setStrangerMode(mode) {
  state.strangerMode = mode;
  $("#strangerSignInTab").classList.toggle("active", mode === "signin");
  $("#strangerSignUpTab").classList.toggle("active", mode === "signup");
  $("#strangerSubmitBtn").textContent = mode === "signin" ? "Sign in" : "Sign up";
}

function showStrangerAuth() {
  $("#gateGridView").hidden = true;
  $("#dianaQaView").hidden = true;
  $("#strangerAuth").hidden = false;
}
function showDianaQaView() {
  $("#gateGridView").hidden = true;
  $("#strangerAuth").hidden = true;
  $("#dianaQaView").hidden = false;
}
function showFigurineGrid() {
  $("#strangerAuth").hidden = true;
  $("#dianaQaView").hidden = true;
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
    // A stranger isn't the owner or Diana, but reuses the owner's muscle
    // taxonomy (Diana's is a curated profile for Diana specifically, not
    // a generic template) — their data still stays fully isolated via
    // auth.uid(), independent of activeProfile().
    enterApp("owner");
  } catch (err) {
    errEl.textContent = (err && err.message) || "Something went wrong.";
    errEl.hidden = false;
  }
}

export async function logOut() {
  if (state.currentSession) await supabaseClient.auth.signOut();
  localStorage.removeItem(activeProfile().unlockKey);
  location.reload();
}

// Commits which profile this session is gated into, before init() ever
// renders anything — resetProfileFilters() (log-tab.js) rebuilds the
// muscle-scoped filter Sets off that profile's own categories, since
// they're otherwise still sitting at their owner-default, module-load-
// time values.
function enterApp(profile) {
  state.activeProfile = profile;
  resetProfileFilters();
  $("#gateScreen").hidden = true;
  $(".wrap").hidden = false;
  init();
  if (profile === "diana") showLoginGreeting();
}

// A one-time "Hola Di!" toast right as her gate unlocks — not shown on a
// plain page reload of an already-unlocked session (bootstrap()'s
// return-visit branches call init() directly, never this function), just
// the actual login moment. The fade-out is a pure CSS animation
// (.login-greeting, style.css); this just re-hides the element once it's
// done so it doesn't linger in the a11y tree.
function showLoginGreeting() {
  const el = $("#loginGreeting");
  if (!el) return;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3600);
}

// ---------- Diana's gate-enabled toggle (diana_gate_settings) ----------
// A single settings row the owner's own session reads/writes directly via
// the anon-key client — not a secret, just the on/off switch, and the
// owner's session only ever has the anon key (no real Supabase Auth
// account) to work with. See supabase/diana_schema.sql.
export async function loadDianaGateSetting() {
  try {
    const { data, error } = await supabaseClient
      .from("diana_gate_settings")
      .select("gate_enabled")
      .eq("id", 1)
      .single();
    if (error) throw error;
    state.dianaGateEnabled = Boolean(data.gate_enabled);
  } catch (e) {
    console.error("Diana gate setting load error", e);
    // Fail safe: if we can't confirm the gate is off, treat it as on.
    state.dianaGateEnabled = true;
  }
  return state.dianaGateEnabled;
}

export async function setDianaGateSetting(enabled) {
  try {
    const { error } = await supabaseClient
      .from("diana_gate_settings")
      .upsert({ id: 1, gate_enabled: enabled }, { onConflict: "id" });
    if (error) throw error;
    state.dianaGateEnabled = enabled;
    return true;
  } catch (e) {
    console.error("Diana gate setting save error", e);
    alert("Could not save the setting.");
    return false;
  }
}

// The toggle itself lives in the header (#dianaGateToggle, next to the
// hamburger), not the Exercises tab — it's set once per session, since
// activeProfile() never changes mid-session, so there's no need to
// re-render it on every tab switch the way tab-scoped UI does. Called
// once from main.js's init(); no-ops (stays hidden) for anyone who isn't
// the owner, or when the gate mechanism doesn't apply at all.
export async function wireDianaGateToggle() {
  const btn = $("#dianaGateToggle");
  if (!btn) return;
  if (!useSupabase || !GATE_ENABLED || activeProfile().key !== "owner") {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  await loadDianaGateSetting();
  syncDianaGateToggleVisual(btn);
  btn.addEventListener("click", async () => {
    const desired = !state.dianaGateEnabled;
    const ok = await setDianaGateSetting(desired);
    if (ok) syncDianaGateToggleVisual(btn);
  });
}

function syncDianaGateToggleVisual(btn) {
  btn.classList.toggle("active", state.dianaGateEnabled);
  btn.setAttribute("aria-pressed", String(state.dianaGateEnabled));
}

function wireGateEvents() {
  $("#strangerBtn").addEventListener("click", showStrangerAuth);
  $("#strangerBackBtn").addEventListener("click", showFigurineGrid);
  $("#strangerSignInTab").addEventListener("click", () => setStrangerMode("signin"));
  $("#strangerSignUpTab").addEventListener("click", () => setStrangerMode("signup"));
  $("#strangerForm").addEventListener("submit", handleStrangerSubmit);
  $("#dianaQaBackBtn").addEventListener("click", () => { dianaQaId = null; showFigurineGrid(); });
  $("#dianaQaForm").addEventListener("submit", handleDianaQaSubmit);
}

export async function bootstrap() {
  if (!useSupabase || !GATE_ENABLED) {
    await init();
    return;
  }

  if (localStorage.getItem(OWNER_UNLOCK_KEY) === "true") {
    state.activeProfile = "owner";
    resetProfileFilters();
    await init();
    return;
  }
  if (localStorage.getItem(DIANA_UNLOCK_KEY) === "true") {
    state.activeProfile = "diana";
    resetProfileFilters();
    await init();
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    state.currentSession = data.session;
    state.activeProfile = "owner"; // see handleStrangerSubmit()'s enterApp("owner") for why
    resetProfileFilters();
    await init();
    return;
  }

  $(".wrap").hidden = true;
  $("#gateScreen").hidden = false;
  $("#gateLogoSlot").innerHTML = renderKnifeTitle("brand") + `<p class="knife-desc">A training log platform.</p>`;
  buildFigurineGrid();
  wireGateEvents();
}
