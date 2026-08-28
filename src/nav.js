import { state, VIEW_IDS } from "./state.js";
import { $, $all } from "./dom-utils.js";
import { enterMuscleGate, showTodayWorkoutPage, setHeaderTitle } from "./log-tab.js";
import { renderCharts } from "./progress-tab.js";
import { renderCalendar } from "./calendar-tab.js";
import { renderSuggested } from "./suggested-tab.js";
import { renderExerciseManage } from "./exercises-tab.js";
import { renderFeedbackView } from "./feedback-tab.js";
import { renderDevToolsView } from "./gate.js";

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

// Same open/close pattern as the hamburger, for the header's other icon
// (#statsToggle/#statsDropdown, main.js) — the two are independent panels,
// each closes on an outside click regardless of the other's state.
export function toggleStatsDropdown(force) {
  const panel = $("#statsDropdown");
  const btn = $("#statsToggle");
  const open = typeof force === "boolean" ? force : !panel.classList.contains("open");
  panel.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", String(open));
}

// Each view's header title — a plain page name, or null to show nothing
// when the page's own content already carries an equivalent heading
// right below it (see log-tab.js's setHeaderTitle() for why).
const VIEW_TITLES = {
  progress: "Progress",
  calendar: null,
  suggested: null,
  exercises: "Exercises",
  feedback: "Feedback",
  devtools: "Developer Tools",
};

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
  // The "Log" dropdown item lands on Today's Workout directly — the
  // muscle-select wheel is reached separately, via #wheelToggle in the
  // header (enterWheelView(), below), not through this dropdown row.
  if (view === "log") showTodayWorkoutPage();
  else setHeaderTitle(VIEW_TITLES[view] ?? null);
  if (view === "progress") renderCharts();
  if (view === "calendar") renderCalendar();
  if (view === "suggested") renderSuggested();
  if (view === "exercises") renderExerciseManage();
  if (view === "feedback") renderFeedbackView();
  if (view === "devtools") renderDevToolsView();
}

// #wheelToggle's own handler (main.js) — switches to the Log view same as
// any other dropdown row, then swaps in the muscle-select gate instead of
// setView("log")'s own default (Today's Workout). Mirrors the pattern
// jumpToExercise() (suggested-tab.js) already used to land on Today's
// Workout specifically, just aimed at the wheel instead.
export function enterWheelView() {
  setView("log");
  enterMuscleGate();
}
