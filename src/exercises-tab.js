import { state, activeProfile, EXERCISE_DELETE_PIN } from "./state.js";
import { $, $all, exerciseSort } from "./dom-utils.js";
import { saveExercise, renameExercise, backupExerciseDeletion, deleteExercise, deleteEntries } from "./persistence.js";
import { buildExerciseBlocks, buildLogNavBrowser, render } from "./log-tab.js";
import { renderSuggested } from "./suggested-tab.js";

// The "Add exercise" muscle-group <select> can't be hardcoded in
// index.html the way it used to be — the owner and Diana have different
// category sets — so it's filled from the active profile every render.
function populateMuscleSelect() {
  const select = $("#newExMuscle");
  if (!select) return;
  const { muscles, muscleLabels } = activeProfile();
  select.innerHTML = muscles.map(m => `<option value="${m}">${muscleLabels[m]}</option>`).join("");
}

export function renderExerciseManage() {
  populateMuscleSelect();

  const container = $("#exerciseManageList");
  container.innerHTML = "";
  const { muscles, muscleLabels, muscleColors } = activeProfile();

  muscles.forEach(m => {
    const group = state.EXERCISES.filter(ex => ex.muscle === m);
    if (group.length === 0) return;

    const h = document.createElement("h3");
    h.className = "ex-group-title";
    h.textContent = muscleLabels[m];
    h.style.color = muscleColors[m];
    container.appendChild(h);

    group.forEach(ex => {
      const row = document.createElement("div");
      row.className = "ex-manage-row";
      row.innerHTML = `
        <span class="ex-manage-name-wrap">
          <span class="ex-manage-name">${ex.name}</span>${ex.perHand ? ' <span class="ex-tag">Per hand</span>' : ''}${ex.repsOnly ? ' <span class="ex-tag">Reps only</span>' : ''}
          <button type="button" class="icon-btn ex-rename-btn" title="Rename">✎</button>
          <button type="button" class="icon-btn ex-delete-btn" title="Delete">🗑</button>
        </span>
        <label class="ex-backbone-toggle">
          <input type="checkbox" ${ex.backbone ? "checked" : ""}>
          Backbone
        </label>
      `;
      $("input[type=checkbox]", row).addEventListener("change", (evt) => toggleBackbone(ex.name, evt.target.checked));
      $(".ex-rename-btn", row).addEventListener("click", () => startRenameExercise(ex, row));
      $(".ex-delete-btn", row).addEventListener("click", () => deleteExerciseFlow(ex));
      container.appendChild(row);
    });
  });

  $("#exercisesCount").textContent = `${state.EXERCISES.length} exercises`;
}

function startRenameExercise(ex, row) {
  const wrap = $(".ex-manage-name-wrap", row);
  wrap.innerHTML = `
    <input type="text" class="edit-input ex-rename-input" value="${ex.name}">
    <button type="button" class="icon-btn ex-rename-save" title="Save">✓</button>
    <button type="button" class="icon-btn ex-rename-cancel" title="Cancel">×</button>
  `;
  const input = $(".ex-rename-input", wrap);
  input.focus();
  input.select();

  $(".ex-rename-save", wrap).addEventListener("click", async () => {
    const newName = input.value.trim();
    if (!newName) {
      alert("Enter a name.");
      return;
    }
    if (newName === ex.name) {
      renderExerciseManage();
      return;
    }
    if (state.EXERCISES.some(x => x.name.toLowerCase() === newName.toLowerCase())) {
      alert("An exercise with that name already exists.");
      return;
    }
    const ok = await renameExercise(ex, newName);
    if (!ok) return;
    state.EXERCISES.sort(exerciseSort);
    buildExerciseBlocks();
    buildLogNavBrowser();
    renderExerciseManage();
    render();
  });
  $(".ex-rename-cancel", wrap).addEventListener("click", () => renderExerciseManage());
}

async function toggleBackbone(name, value) {
  const ex = state.EXERCISES.find(x => x.name === name);
  if (!ex) return;
  ex.backbone = value;
  await saveExercise(ex);
  if (state.currentView === "suggested") renderSuggested();
}

// Deleting an exercise with logged sets also deletes those sets (there's
// no orphaned-entries state — an entry referencing a nonexistent exercise
// would just be dead weight everywhere it's read), which is real,
// permanent workout history — hence the extra 6-digit-code gate on top of
// the plain confirm() a no-history exercise gets, and why a safety backup
// is always written first and the delete only proceeds if that succeeds.
async function deleteExerciseFlow(ex) {
  const logs = state.entries.filter(e => e.exercise === ex.name);

  if (logs.length > 0) {
    const code = prompt(
      `"${ex.name}" has ${logs.length} logged set${logs.length === 1 ? "" : "s"} — deleting it removes ` +
      `those permanently (a backup is saved first). Enter the 6-digit code to confirm:`
    );
    if (code === null) return;
    if (code.trim() !== EXERCISE_DELETE_PIN) {
      alert("Incorrect code — nothing was deleted.");
      return;
    }
  } else {
    if (!confirm(`Delete "${ex.name}"? It has no logged sets.`)) return;
  }

  const backedUp = await backupExerciseDeletion(ex, logs);
  if (!backedUp) return; // already alerted — nothing touched

  const logIds = logs.map(e => e.id);
  state.entries = state.entries.filter(e => e.exercise !== ex.name);
  state.EXERCISES = state.EXERCISES.filter(x => x.name !== ex.name);

  if (logIds.length > 0) await deleteEntries(logIds);
  await deleteExercise(ex);

  buildExerciseBlocks();
  buildLogNavBrowser();
  renderExerciseManage();
  render();
  if (state.currentView === "suggested") renderSuggested();
}

// The Cardio checkbox is mutually exclusive with Per hand/Track weight —
// a cardio exercise logs distance+time instead, so those two don't apply.
export function wireCardioCheckbox() {
  const cardio = $("#newExCardio");
  if (!cardio) return;
  cardio.addEventListener("change", () => {
    $("#newExPerHand").disabled = cardio.checked;
    $("#newExWeighted").disabled = cardio.checked;
  });
}

export async function addExercise() {
  const nameInput = $("#newExName");
  const name = nameInput.value.trim();
  if (!name) {
    alert("Enter an exercise name.");
    return;
  }
  if (state.EXERCISES.some(x => x.name.toLowerCase() === name.toLowerCase())) {
    alert("An exercise with that name already exists.");
    return;
  }

  const cardio = $("#newExCardio").checked;
  const weighted = $("#newExWeighted").checked;
  const newEx = cardio
    ? { name, muscle: $("#newExMuscle").value, cardio: true, perHand: false, repsOnly: false, min: null, max: null, step: null, backbone: false }
    : { name, muscle: $("#newExMuscle").value, perHand: $("#newExPerHand").checked, repsOnly: !weighted,
        min: weighted ? 0 : null, max: null, step: weighted ? 1 : null, backbone: false };

  const ok = await saveExercise(newEx);
  if (!ok) return;

  state.EXERCISES.push(newEx);
  state.EXERCISES.sort(exerciseSort);

  nameInput.value = "";
  $("#newExPerHand").checked = false;
  $("#newExWeighted").checked = true;
  $("#newExCardio").checked = false;
  $("#newExPerHand").disabled = false;
  $("#newExWeighted").disabled = false;

  buildExerciseBlocks();
  buildLogNavBrowser();
  renderExerciseManage();
  if (state.currentView === "suggested") renderSuggested();
}
