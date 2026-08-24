import { state, MUSCLES, MUSCLE_LABELS, MUSCLE_COLORS } from "./state.js";
import { $, $all, exerciseSort } from "./dom-utils.js";
import { saveExercise, renameExercise } from "./persistence.js";
import { buildExerciseBlocks, render } from "./log-tab.js";
import { renderSuggested } from "./suggested-tab.js";

export function renderExerciseManage() {
  const container = $("#exerciseManageList");
  container.innerHTML = "";

  MUSCLES.forEach(m => {
    const group = state.EXERCISES.filter(ex => ex.muscle === m);
    if (group.length === 0) return;

    const h = document.createElement("h3");
    h.className = "ex-group-title";
    h.textContent = MUSCLE_LABELS[m];
    h.style.color = MUSCLE_COLORS[m];
    container.appendChild(h);

    group.forEach(ex => {
      const row = document.createElement("div");
      row.className = "ex-manage-row";
      row.innerHTML = `
        <span class="ex-manage-name-wrap">
          <span class="ex-manage-name">${ex.name}</span>${ex.perHand ? ' <span class="ex-tag">Per hand</span>' : ''}${ex.repsOnly ? ' <span class="ex-tag">Reps only</span>' : ''}
          <button type="button" class="icon-btn ex-rename-btn" title="Rename">✎</button>
        </span>
        <label class="ex-backbone-toggle">
          <input type="checkbox" ${ex.backbone ? "checked" : ""}>
          Backbone
        </label>
      `;
      $("input[type=checkbox]", row).addEventListener("change", (evt) => toggleBackbone(ex.name, evt.target.checked));
      $(".ex-rename-btn", row).addEventListener("click", () => startRenameExercise(ex, row));
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

  const weighted = $("#newExWeighted").checked;
  const newEx = {
    name,
    muscle: $("#newExMuscle").value,
    perHand: $("#newExPerHand").checked,
    repsOnly: !weighted,
    min: weighted ? 0 : null,
    max: null,
    step: weighted ? 1 : null,
    backbone: false,
  };

  const ok = await saveExercise(newEx);
  if (!ok) return;

  state.EXERCISES.push(newEx);
  state.EXERCISES.sort(exerciseSort);

  nameInput.value = "";
  $("#newExPerHand").checked = false;
  $("#newExWeighted").checked = true;

  buildExerciseBlocks();
  renderExerciseManage();
  if (state.currentView === "suggested") renderSuggested();
}
