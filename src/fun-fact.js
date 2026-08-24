import { state } from "./state.js";
import { $ } from "./dom-utils.js";
import { computeStats } from "./log-tab.js";

// ---------- Fun fact ----------
// Loaded once and picked once per page load — never recomputed by render()
// — so the displayed comparison stays stable while you log sets and only
// changes when you refresh.
export async function loadComparisons() {
  try {
    const res = await fetch("/data/comparisons.txt");
    if (!res.ok) throw new Error("fetch failed: " + res.status);
    const text = await res.text();
    state.funFactComparisons = text.split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"))
      .map(line => {
        const [label, kg] = line.split("|");
        return { label: (label || "").trim(), kg: parseFloat(kg) };
      })
      .filter(c => c.label && !isNaN(c.kg));
  } catch (e) {
    console.error("Could not load fun-fact comparisons", e);
    state.funFactComparisons = [];
  }
}

export function renderFunFact() {
  const el = $("#funFact");
  if (!el) return;
  const stats = computeStats();
  const qualifying = state.funFactComparisons.filter(c => stats.totalVolume >= c.kg);
  if (qualifying.length === 0) {
    el.hidden = true;
    return;
  }
  const pick = qualifying[Math.floor(Math.random() * qualifying.length)];
  const ratio = Math.floor(stats.totalVolume / pick.kg);
  el.textContent = ratio <= 1
    ? `🏋️ You've lifted the weight of ${pick.label}!`
    : `🏋️ You've lifted ${ratio.toLocaleString()}× the weight of ${pick.label}!`;
  el.hidden = false;
}
