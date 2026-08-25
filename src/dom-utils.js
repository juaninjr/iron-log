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
