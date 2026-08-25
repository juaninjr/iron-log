import "./style.css";
import "./wheel3d.js"; // side-effect only: registers window.IronLogWheel3D

import { state, GATE_ENABLED } from "./state.js";
import { $, $all, todayISO, triggerHaptic } from "./dom-utils.js";
import { loadEntries, loadExercises, loadTodayPlan } from "./persistence.js";
import {
  logWorkout, enterMuscleGate, confirmMuscleSelection,
  showTodayWorkoutPage, setHeaderTitle, buildExerciseBlocks, buildAllExercisesList, render,
} from "./log-tab.js";
import { renderCharts } from "./progress-tab.js";
import { renderCalendar } from "./calendar-tab.js";
import { addExercise } from "./exercises-tab.js";
import { downloadPDF, exportBackup, importBackup, clearAllData } from "./export.js";
import { toggleNavMenu, setView } from "./nav.js";
import { logOut, bootstrap, wireDianaGateToggle } from "./gate.js";

// ---------- Wire up ----------
export async function init() {
  $("#workoutDate").value = todayISO();

  setHeaderTitle(false);
  wireDianaGateToggle();

  $("#pdfBtn").addEventListener("click", downloadPDF);
  $("#exportBtn").addEventListener("click", exportBackup);
  $("#clearBtn").addEventListener("click", clearAllData);

  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importBackup(file);
    e.target.value = "";
  });

  $all(".tab-btn", $("#mainTabs")).forEach(btn => {
    btn.addEventListener("click", () => { setView(btn.dataset.view); toggleNavMenu(false); });
  });
  $("#navToggle").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleNavMenu();
  });
  document.addEventListener("click", (e) => {
    if (!$("#mainTabs").classList.contains("open")) return;
    if (e.target.closest("#mainTabs") || e.target.closest("#navToggle")) return;
    toggleNavMenu(false);
  });
  $("#calPrev").addEventListener("click", () => {
    state.calMonth.setMonth(state.calMonth.getMonth() - 1);
    renderCalendar();
  });
  $("#calNext").addEventListener("click", () => {
    state.calMonth.setMonth(state.calMonth.getMonth() + 1);
    renderCalendar();
  });
  $("#addExerciseBtn").addEventListener("click", addExercise);
  $("#logWorkoutBtn").addEventListener("click", () => logWorkout());
  // "Create Plan" — straight to the Today's Workout main page, which
  // already lists every exercise (see "All exercises", buildAllExercisesList()).
  $("#skipToLogBtn").addEventListener("click", showTodayWorkoutPage);
  // The picker's back icon and its "Train more" button both take you to
  // that same full list, instead of "Train more" bouncing back to the
  // wheel — the wheel's muscle-scoped picker is a shortcut, not the only
  // way to see everything else.
  $("#quickLogBackBtn").addEventListener("click", showTodayWorkoutPage);
  $("#trainMorePickerBtn").addEventListener("click", showTodayWorkoutPage);
  // Tapping a recognized (hoverable/highlighted) part of the 3D model
  // picks that muscle directly — wheel3d.js dispatches this once per
  // tap-that-hits-a-part. The button row stays as a fallback.
  $("#wheel3dContainer").addEventListener("musclepick", (evt) => {
    triggerHaptic();
    confirmMuscleSelection(evt.detail.muscle);
  });
  $("#logOutBtn").addEventListener("click", logOut);
  if (GATE_ENABLED) $("#logOutBtn").hidden = false;

  let resizeRaf = null;
  function runResize() {
    if (state.currentView === "progress") {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(renderCharts);
    } else if (state.currentView === "log" && !$("#muscleSelectStage").hidden) {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => { if (window.IronLogWheel3D) window.IronLogWheel3D.resize(); });
    }
  }
  window.addEventListener("resize", runResize);
  // Mobile browsers can settle into their final viewport (address-bar
  // collapse, etc.) after the "resize" listener above was wired and the
  // wheel's one-time initial sizing already ran — re-running on "load"
  // (full page + assets settled) and on a visualViewport resize (the
  // actual signal for that browser-chrome-driven size change) keeps the
  // 3D canvas from staying sized for a stale viewport. "pageshow" covers
  // the bfcache-restore case (e.g. swiping back). window.scrollTo(0,0) is
  // a standard mitigation for mobile Safari's own quirk of restoring the
  // previous scroll/pinch-zoom level on reload instead of resetting it —
  // both are cheap, harmless on desktop, and target the reported
  // first-load-looks-zoomed-in symptom from two different angles.
  function onLoadSettle() {
    window.scrollTo(0, 0);
    runResize();
  }
  window.addEventListener("load", onLoadSettle);
  window.addEventListener("pageshow", onLoadSettle);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", runResize);

  // Initial load starts on the muscle-select gate (currentView is "log").
  enterMuscleGate();

  await loadExercises();
  await loadTodayPlan();
  buildExerciseBlocks();
  buildAllExercisesList();

  await loadEntries();
  render();
}

document.addEventListener("DOMContentLoaded", bootstrap);
