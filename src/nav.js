import { state, VIEW_IDS } from "./state.js";
import { $, $all } from "./dom-utils.js";
import { enterMuscleGate, setHeaderTitle } from "./log-tab.js";
import { renderCharts } from "./progress-tab.js";
import { renderCalendar } from "./calendar-tab.js";
import { renderSuggested } from "./suggested-tab.js";
import { renderExerciseManage } from "./exercises-tab.js";

// The nav is a hamburger dropdown, not a full-width tab bar — this just
// toggles the panel's own open/closed state; it's independent of the
// muscle-gate's hidden/shown state (enterMuscleGate/leaveMuscleGate).
export function toggleNavMenu(force) {
  const menu = $("#mainTabs");
  const btn = $("#navToggle");
  const open = typeof force === "boolean" ? force : !menu.classList.contains("open");
  menu.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", String(open));
}

export function setView(view) {
  state.currentView = view;
  Object.keys(VIEW_IDS).forEach(v => {
    const el = $("#" + VIEW_IDS[v]);
    if (v === view) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
  });
  $all(".tab-btn", $("#mainTabs")).forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  // Re-entering Log always starts at the muscle-select gate. The header
  // is hidden there anyway (enterMuscleGate()) — its title only matters
  // again once showTodayWorkoutPage() (log-tab.js) un-hides it, which
  // sets its own title, so every other tab just needs to restore "Knife".
  if (view === "log") enterMuscleGate();
  else setHeaderTitle(false);
  if (view === "progress") renderCharts();
  if (view === "calendar") renderCalendar();
  if (view === "suggested") renderSuggested();
  if (view === "exercises") renderExerciseManage();
}
