import { state, MUSCLES, MUSCLE_LABELS, MUSCLE_COLORS } from "./state.js";
import { $, fmtDate, cssEscape } from "./dom-utils.js";
import { leaveMuscleGate, buildMuscleFilterRow, buildExerciseBlocks } from "./log-tab.js";
import { setView } from "./nav.js";

// Most recent date any exercise in each muscle group was logged.
function muscleLastTrained() {
  const last = {};
  MUSCLES.forEach(m => { last[m] = null; });
  state.entries.forEach(e => {
    const ex = state.EXERCISES.find(x => x.name === e.exercise);
    if (!ex) return;
    if (!last[ex.muscle] || e.date > last[ex.muscle]) last[ex.muscle] = e.date;
  });
  return last;
}

function lastTrainedForExercise(name) {
  let last = null;
  state.entries.forEach(e => {
    if (e.exercise === name && (!last || e.date > last)) last = e.date;
  });
  return last;
}

export function jumpToExercise(name) {
  setView("log");
  // Jumping straight to an exercise skips the muscle-select gate.
  leaveMuscleGate();
  // Guarantee the target is visible regardless of the current muscle filter.
  state.logMuscleFilter = new Set(MUSCLES);
  buildMuscleFilterRow();
  buildExerciseBlocks();
  requestAnimationFrame(() => {
    const block = document.querySelector(`.exercise-block[data-exercise="${cssEscape(name)}"]`);
    if (!block) return;
    block.scrollIntoView({ behavior: "smooth", block: "center" });
    block.classList.add("flash");
    setTimeout(() => block.classList.remove("flash"), 1200);
  });
}

export function renderSuggested() {
  const last = muscleLastTrained();
  const backboneByMuscle = {};
  MUSCLES.forEach(m => { backboneByMuscle[m] = state.EXERCISES.filter(ex => ex.muscle === m && ex.backbone); });

  // Never-trained muscles rank first, then oldest last-trained date first.
  const ranked = MUSCLES.slice().sort((a, b) => {
    const da = last[a], db = last[b];
    if (da === db) return 0;
    if (!da) return -1;
    if (!db) return 1;
    return da < db ? -1 : 1;
  });

  const target = ranked.find(m => backboneByMuscle[m].length > 0);
  const primary = $("#suggestedPrimary");

  if (!target) {
    primary.innerHTML = `<p class="empty-note">No backbone exercises yet — mark some in the Exercises tab.</p>`;
  } else {
    const exList = backboneByMuscle[target].slice().sort((a, b) => {
      const da = lastTrainedForExercise(a.name), db = lastTrainedForExercise(b.name);
      if (da === db) return 0;
      if (!da) return -1;
      if (!db) return 1;
      return da < db ? -1 : 1;
    });
    const lastStr = last[target] ? fmtDate(last[target]) : "never";

    primary.innerHTML = `
      <div class="suggest-card">
        <div class="suggest-muscle" style="color:${MUSCLE_COLORS[target]};">${MUSCLE_LABELS[target]}</div>
        <div class="suggest-sub">Last trained ${lastStr}</div>
        <div class="suggest-chips" id="suggestChips"></div>
      </div>
    `;
    const chipsWrap = $("#suggestChips");
    exList.forEach(ex => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "suggest-chip";
      chip.style.background = MUSCLE_COLORS[target];
      chip.textContent = ex.name;
      chip.addEventListener("click", () => jumpToExercise(ex.name));
      chipsWrap.appendChild(chip);
    });
  }

  const body = $("#muscleBalanceBody");
  body.innerHTML = "";
  ranked.forEach(m => {
    const tr = document.createElement("tr");
    if (m === target) tr.classList.add("highlight");
    const names = backboneByMuscle[m].map(ex => ex.name).join(", ") || "—";
    tr.innerHTML = `
      <td style="color:${MUSCLE_COLORS[m]};font-weight:700;">${MUSCLE_LABELS[m]}</td>
      <td>${last[m] ? fmtDate(last[m]) : "Never"}</td>
      <td>${names}</td>
    `;
    body.appendChild(tr);
  });
}
