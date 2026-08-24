import "./style.css";
import "./wheel3d.js"; // side-effect only: registers window.IronLogWheel3D

import { state, GATE_ENABLED } from "./state.js";
import { $, $all, todayISO, triggerHaptic } from "./dom-utils.js";
import { loadEntries, loadExercises } from "./persistence.js";
import {
  buildMuscleFilterRow, buildExerciseBlocks, logWorkout, enterMuscleGate,
  skipToLogPage, confirmMuscleSelection, render,
} from "./log-tab.js";
import { renderCharts } from "./progress-tab.js";
import { renderCalendar } from "./calendar-tab.js";
import { addExercise } from "./exercises-tab.js";
import { downloadPDF, exportBackup, importBackup, clearAllData } from "./export.js";
import { loadComparisons, renderFunFact } from "./fun-fact.js";
import { toggleNavMenu, setView } from "./nav.js";
import { logOut, bootstrap } from "./gate.js";

// ---------- Wire up ----------
export async function init() {
  $("#workoutDate").value = todayISO();

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
  $("#logWorkoutBtn").addEventListener("click", logWorkout);
  $("#skipToLogBtn").addEventListener("click", skipToLogPage);
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
  window.addEventListener("resize", () => {
    if (state.currentView === "progress") {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(renderCharts);
    } else if (state.currentView === "log" && !$("#muscleSelectStage").hidden) {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => { if (window.IronLogWheel3D) window.IronLogWheel3D.resize(); });
    }
  });

  // Initial load starts on the muscle-select gate (currentView is "log").
  enterMuscleGate();

  await loadExercises();
  buildMuscleFilterRow();
  buildExerciseBlocks();

  await loadEntries();
  render();

  await loadComparisons();
  renderFunFact();
}

document.addEventListener("DOMContentLoaded", bootstrap);
