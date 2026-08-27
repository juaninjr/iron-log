import { activeProfile } from "./state.js";

export const $ = (sel, root) => (root || document).querySelector(sel);
export const $all = (sel, root) => Array.from((root || document).querySelectorAll(sel));

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function exerciseSort(a, b) {
  const muscles = activeProfile().muscles;
  const ma = muscles.indexOf(a.muscle), mb = muscles.indexOf(b.muscle);
  if (ma !== mb) return ma - mb;
  return a.name.localeCompare(b.name);
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtDateShort(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function cssEscape(str) {
  return str.replace(/["\\]/g, "\\$&");
}

// ---------- Toasts ----------
// A transient message bubble — shared by Diana's one-time login greeting
// (gate.js) and the post-log confirmation (log-tab.js). The element
// itself carries a one-shot CSS fade animation (.toast, style.css); this
// just unhides it and re-hides it once that animation's had time to
// finish. `durationMs` should match the element's own animation-duration
// (base .toast is 2.2s; .login-greeting overrides to 3.5s) — pass the
// same number here so the element disappears exactly when the fade-out
// completes, not before/after.
export function showToast(id, durationMs) {
  const el = $("#" + id);
  if (!el) return;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, durationMs);
}

// ---------- Haptics ----------
// Android/Chromium: Vibration API. iOS Safari (18+): a system haptic only
// fires when a <label> for a switch-type checkbox is clicked — see the
// hidden #hapticSwitch/#hapticLabel pair near the end of <body>.
export function triggerHaptic() {
  if ("vibrate" in navigator) {
    try { navigator.vibrate(50); } catch (e) { /* ignore */ }
  }
  const label = $("#hapticLabel");
  if (label) label.click();
}
