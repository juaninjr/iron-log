import { state, activeProfile } from "./state.js";
import { $, $all, fmtDate, cssEscape, triggerHaptic } from "./dom-utils.js";
import { saveEntries, deleteEntries } from "./persistence.js";
import { renderCharts } from "./progress-tab.js";
import { renderCalendar } from "./calendar-tab.js";
import { renderSuggested } from "./suggested-tab.js";

// Rebuilds the three muscle-scoped Set filters (state.js) off the active
// profile's own muscle list — those Sets are built once at module-load
// time (always off the owner's list, since no profile is chosen yet at
// that point), so a non-owner profile needs them rebuilt right after
// gate.js picks it, before init() renders anything.
export function resetProfileFilters() {
  state.weightFilterSelected = new Set(activeProfile().muscles);
  state.repsFilterSelected = new Set(activeProfile().muscles);
  state.logMuscleFilter = new Set(activeProfile().muscles);
}

// ---------- Build the log form ----------
export function buildMuscleFilterRow() {
  const row = $("#muscleFilterRow");
  if (!row) return;
  row.innerHTML = "";
  const { muscles, muscleLabels } = activeProfile();

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "muscle-chip muscle-chip-all" + (state.logMuscleFilter.size === muscles.length ? "" : " inactive");
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    state.logMuscleFilter = new Set(muscles);
    buildMuscleFilterRow();
    buildExerciseBlocks();
  });
  row.appendChild(allBtn);

  muscles.forEach(m => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "muscle-chip" + (state.logMuscleFilter.has(m) ? "" : " inactive");
    chip.textContent = muscleLabels[m];
    chip.addEventListener("click", () => {
      // Starting from "All": clicking a muscle isolates it. From then on,
      // clicking another muscle adds it to the selection; re-clicking an
      // already-active one toggles it back off. The "All" chip is the
      // only way to jump straight back to showing everything at once.
      if (state.logMuscleFilter.size === muscles.length) state.logMuscleFilter = new Set([m]);
      else if (state.logMuscleFilter.has(m)) state.logMuscleFilter.delete(m);
      else state.logMuscleFilter.add(m);
      buildMuscleFilterRow();
      buildExerciseBlocks();
    });
    row.appendChild(chip);
  });
}

// ---------- Muscle-select stage (the gate in front of the Log page) ----------
// The 3D model (wheel3d.js) spins for feel and is fully hoverable/tappable
// (see wheel3d.js); this row of buttons is both a fallback picker for
// parts that don't hover cleanly (or touch devices) and, via the
// mouseenter/mouseleave pair below, the button side of a two-way hover
// with the model — hovering a button highlights the matching 3D part, and
// vice versa (the "musclehover" listener in enterMuscleGate()). See
// legacy/muscle-wheel-2d-backup.md for the old spinning-dial-as-picker
// version this replaced.
export function buildMusclePickRow() {
  const row = $("#musclePickRow");
  if (!row) return;
  row.innerHTML = "";
  const { muscles, muscleLabels } = activeProfile();
  muscles.forEach(m => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "muscle-pick-btn";
    btn.textContent = muscleLabels[m];
    btn.dataset.muscle = m;
    btn.addEventListener("mouseenter", () => { if (window.IronLogWheel3D) window.IronLogWheel3D.hoverMuscle(m); });
    btn.addEventListener("mouseleave", () => { if (window.IronLogWheel3D) window.IronLogWheel3D.hoverMuscle(null); });
    btn.addEventListener("click", () => {
      triggerHaptic();
      confirmMuscleSelection(m);
    });
    row.appendChild(btn);
  });
}

// Three stages share #viewLog, only one visible at a time: the wheel
// (#muscleSelectStage) → picking a muscle lands on a single-group
// quick-log page (#quickLogStage) → its back icon (goToGeneralLog) or the
// wheel's own house/knives icon (skipToLogPage) reach the full,
// unfiltered log (#logMainStage). This helper shows the full log's
// header/nav chrome, shared by both of those exits.
function showFullLogChrome() {
  $("#muscleSelectStage").hidden = true;
  $("#quickLogStage").hidden = true;
  $("#logMainStage").hidden = false;
  $("header.top").hidden = false;
  $("#mainTabs").hidden = false;
  document.body.classList.remove("muscle-gate-active", "quick-log-active");
}

// The muscle-select stage hides the header/nav for a fully minimal
// page; both of these are the only ways back to full chrome.
export function leaveMuscleGate() {
  showFullLogChrome();
  if (window.IronLogWheel3D) window.IronLogWheel3D.hide();
}

// Shown after picking a muscle (wheel tap or button click) — just that
// group's exercise blocks, no stats/tables/toolbar. Same minimal-chrome
// treatment as the wheel stage; the only way out is goToGeneralLog().
export function enterQuickLog(m) {
  state.logMuscleFilter = new Set([m]);
  $("#muscleSelectStage").hidden = true;
  $("#logMainStage").hidden = true;
  $("#quickLogStage").hidden = false;
  $("header.top").hidden = true;
  $("#mainTabs").hidden = true;
  document.body.classList.remove("muscle-gate-active");
  document.body.classList.add("quick-log-active");
  if (window.IronLogWheel3D) window.IronLogWheel3D.hide();
  $("#quickLogTitle").textContent = activeProfile().muscleLabels[m];
  buildExerciseBlocks("#quickLogExerciseBlocks");
}

// The quick-log page's small back icon — jumps straight to the full,
// unfiltered log (same destination skipToLogPage() reaches from the
// wheel).
export function goToGeneralLog() {
  state.logMuscleFilter = new Set(activeProfile().muscles);
  showFullLogChrome();
  buildMuscleFilterRow();
  buildExerciseBlocks();
  render();
}

export function confirmMuscleSelection(m) {
  enterQuickLog(m);
}

export function skipToLogPage() {
  state.logMuscleFilter = new Set(activeProfile().muscles);
  leaveMuscleGate();
  buildMuscleFilterRow();
  buildExerciseBlocks();
  render();
}

export function enterMuscleGate() {
  $("#muscleSelectStage").hidden = false;
  $("#logMainStage").hidden = true;
  $("#quickLogStage").hidden = true;
  $("header.top").hidden = true;
  $("#mainTabs").hidden = true;
  document.body.classList.remove("quick-log-active");
  document.body.classList.add("muscle-gate-active");
  buildMusclePickRow();
  if (window.IronLogWheel3D) window.IronLogWheel3D.show($("#wheel3dContainer"));
  // Model → button direction of the two-way hover — bound once per
  // #wheel3dContainer element, harmless to no-op re-add since the
  // container itself is never recreated.
  const wheelEl = $("#wheel3dContainer");
  if (wheelEl && !wheelEl.dataset.hoverWired) {
    wheelEl.dataset.hoverWired = "true";
    wheelEl.addEventListener("musclehover", (evt) => {
      $all(".muscle-pick-btn", $("#musclePickRow")).forEach(btn => {
        btn.classList.toggle("hovered", btn.dataset.muscle === evt.detail.muscle);
      });
    });
  }
}

// ---------- Exercise blocks / logging ----------
// `containerSel` lets both the quick-log stage (#quickLogExerciseBlocks)
// and the full log stage (#exerciseBlocks) build/read their own blocks
// without colliding — only one of the two is ever populated for a given
// pick, but scoping every query to the container keeps it correct even
// if that changes.
export function buildExerciseBlocks(containerSel = "#exerciseBlocks") {
  const container = $(containerSel);
  if (!container) return;
  container.innerHTML = "";
  const visible = state.EXERCISES.filter(ex => state.logMuscleFilter.has(ex.muscle));

  if (visible.length === 0) {
    container.innerHTML = `<p class="empty-note">No exercises selected — enable a muscle group above.</p>`;
    return;
  }

  visible.forEach((ex) => {
    const block = document.createElement("div");
    block.className = "exercise-block";
    block.dataset.exercise = ex.name;
    block.style.setProperty("--ex-muscle-color", activeProfile().muscleColors[ex.muscle]);

    const head = document.createElement("div");
    head.className = "ex-head";
    head.innerHTML = `<span class="ex-name">${ex.name}${ex.perHand ? '<span class="ex-tag">Per hand</span>' : ''}</span>`;
    block.appendChild(head);

    const rows = document.createElement("div");
    rows.className = "rows";
    block.appendChild(rows);
    addSetRow(rows, ex);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-set-btn";
    addBtn.textContent = "+ Add set";
    addBtn.addEventListener("click", () => addSetRow(rows, ex));
    head.appendChild(addBtn);

    container.appendChild(block);
  });
}

export function addSetRow(rowsContainer, ex) {
  const row = document.createElement("div");
  row.className = "set-row" + (ex.repsOnly ? " reps-only" : "");

  if (!ex.repsOnly) {
    const min = ex.min ?? 0;
    const step = ex.step ?? 1;
    const weightWrap = document.createElement("div");
    weightWrap.innerHTML = `
      <label class="field-label">Weight (kg)</label>
      <input type="number" class="weight-input" min="${min}" step="${step}" placeholder="${min}">
    `;
    row.appendChild(weightWrap);
  }

  const repsWrap = document.createElement("div");
  if (ex.repsOnly) {
    repsWrap.innerHTML = `
      <label class="field-label">Reps</label>
      <input type="number" class="reps-input" min="1" step="1" placeholder="Reps">
    `;
  } else {
    let opts = '<option value="">Reps</option>';
    for (let i = 1; i <= 30; i++) opts += `<option value="${i}">${i}</option>`;
    repsWrap.innerHTML = `
      <label class="field-label">Reps</label>
      <select class="reps-input">${opts}</select>
    `;
  }
  row.appendChild(repsWrap);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "icon-btn";
  removeBtn.title = "Remove set";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", () => {
    if (rowsContainer.children.length > 1) {
      row.remove();
    } else {
      // reset instead of removing the last row
      $all("input, select", row).forEach(el => { el.value = ""; });
    }
  });
  row.appendChild(removeBtn);

  rowsContainer.appendChild(row);
}

export async function logWorkout(containerSel = "#exerciseBlocks") {
  const date = $("#workoutDate").value;
  if (!date) {
    alert("Pick a date first.");
    return;
  }

  const container = $(containerSel);
  const newEntries = [];
  let offset = 0;
  const baseTime = Date.now();

  state.EXERCISES.forEach((ex) => {
    const block = container && $(`.exercise-block[data-exercise="${cssEscape(ex.name)}"]`, container);
    if (!block) return; // hidden by the muscle filter — nothing to read
    const rows = $all(".set-row", block);
    rows.forEach((row) => {
      const repsEl = $(".reps-input", row);
      const reps = repsEl.value ? parseFloat(repsEl.value) : null;
      let weight = null;
      if (!ex.repsOnly) {
        const weightEl = $(".weight-input", row);
        weight = weightEl.value !== "" ? parseFloat(weightEl.value) : null;
      }
      const hasData = reps !== null && !isNaN(reps);
      if (!hasData) return;

      newEntries.push({
        id: `${baseTime + offset}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        exercise: ex.name,
        weight: (!ex.repsOnly && weight !== null && !isNaN(weight)) ? weight : null,
        reps: reps,
        loggedAt: baseTime + offset,
      });
      offset += 1;
    });
  });

  if (newEntries.length === 0) {
    alert("Log at least one set before submitting.");
    return;
  }

  state.entries = state.entries.concat(newEntries);
  await saveEntries(newEntries);
  buildExerciseBlocks(containerSel);
  $("#workoutDate").value = date;
  render();
}

// ---------- Derived views ----------
// Groups entries by date+exercise (one card/row per session's sets for
// that exercise, sorted chronologically), most recently logged group first.
export function groupedFullLog() {
  const groups = {};
  state.entries.forEach(e => {
    const key = e.date + "||" + e.exercise;
    (groups[key] = groups[key] || []).push(e);
  });
  return Object.values(groups).map(sets => {
    sets.sort((a, b) => a.loggedAt - b.loggedAt);
    return { key: sets[0].date + "||" + sets[0].exercise, date: sets[0].date, exercise: sets[0].exercise, sets };
  }).sort((a, b) => b.sets[b.sets.length - 1].loggedAt - a.sets[a.sets.length - 1].loggedAt);
}

// Compact "50/70/60" rendering with small reps beneath each weight — used
// in both the Latest-by-exercise and Full-log tables.
export function renderSetsCell(sets, ex) {
  if (sets.length === 0) return '<span class="empty-note" style="padding:0;">Not logged yet</span>';
  return `<div class="sets-compact">` + sets.map((s, i) => {
    const sep = i > 0 ? '<span class="set-sep">/</span>' : '';
    if (ex && ex.repsOnly) {
      return `${sep}<span class="set-item"><span class="set-weight">${s.reps !== null ? s.reps : "—"}</span></span>`;
    }
    return `${sep}<span class="set-item"><span class="set-weight">${s.weight !== null ? s.weight : "—"}</span><span class="set-reps">${s.reps !== null ? s.reps : "—"}</span></span>`;
  }).join("") + `</div>`;
}

// Plain-text equivalent for the PDF export.
export function formatSetsText(sets, ex) {
  if (sets.length === 0) return "—";
  return sets.map(s => {
    if (ex && ex.repsOnly) return `${s.reps !== null ? s.reps : "—"}`;
    return `${s.weight !== null ? s.weight : "—"}×${s.reps !== null ? s.reps : "—"}`;
  }).join(" / ");
}

export function latestByExercise() {
  const latestDate = {};
  state.entries.forEach(e => {
    if (!latestDate[e.exercise] || e.date > latestDate[e.exercise]) latestDate[e.exercise] = e.date;
  });
  return state.EXERCISES.map(ex => {
    const date = latestDate[ex.name] || null;
    const sets = date
      ? state.entries.filter(e => e.exercise === ex.name && e.date === date).sort((a, b) => a.loggedAt - b.loggedAt)
      : [];
    return { ex, date, sets };
  }).sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
  });
}

export function computeStats() {
  let totalVolume = 0;
  state.entries.forEach(e => {
    if (e.weight !== null && e.reps !== null) totalVolume += e.weight * e.reps;
  });
  const days = new Set(state.entries.map(e => e.date));
  let lastDate = null;
  state.entries.forEach(e => { if (!lastDate || e.date > lastDate) lastDate = e.date; });
  const pushups = state.entries
    .filter(e => e.exercise === "Pushups")
    .reduce((sum, e) => sum + (e.reps || 0), 0);
  return { totalVolume, days: days.size, lastDate, pushups };
}

// ---------- Render ----------
export function render() {
  const stats = computeStats();
  $("#statVolume").textContent = Math.round(stats.totalVolume).toLocaleString() + " kg";
  $("#statDays").textContent = stats.days;
  $("#statLast").textContent = stats.lastDate ? fmtDate(stats.lastDate) : "—";
  $("#statPushups").textContent = stats.pushups;

  // Latest by exercise
  const latestBody = $("#latestBody");
  latestBody.innerHTML = "";
  latestByExercise().forEach(({ ex, date, sets }) => {
    const tr = document.createElement("tr");
    const name = ex.name + (ex.perHand ? ' <span class="per-hand-note">(per hand)</span>' : '');
    if (date) {
      tr.innerHTML = `
        <td>${name}</td>
        <td>${fmtDate(date)}</td>
        <td>${renderSetsCell(sets, ex)}</td>
      `;
    } else {
      tr.innerHTML = `<td>${name}</td><td colspan="2" class="empty-note">Not logged yet</td>`;
    }
    latestBody.appendChild(tr);
  });

  // Full log
  const fullBody = $("#fullLogBody");
  fullBody.innerHTML = "";
  const groups = groupedFullLog();
  $("#fullLogCount").textContent = state.entries.length ? `${state.entries.length} sets` : "";

  if (groups.length === 0) {
    fullBody.innerHTML = `<tr><td colspan="4" class="empty-note">No sets logged yet. Log your first workout above.</td></tr>`;
  } else {
    const mostRecentDate = stats.lastDate;
    groups.forEach(g => {
      const tr = document.createElement("tr");
      if (g.date === mostRecentDate) tr.classList.add("highlight");
      const ex = state.EXERCISES.find(x => x.name === g.exercise);

      if (g.key === state.editingGroupKey) {
        tr.classList.add("editing");
        const exOptions = state.EXERCISES.map(x =>
          `<option value="${x.name}" ${x.name === g.exercise ? "selected" : ""}>${x.name}</option>`
        ).join("");
        tr.innerHTML = `
          <td colspan="4">
            <div class="group-edit">
              <div class="group-edit-head">
                <input type="date" class="edit-input edit-date" value="${g.date}">
                <select class="edit-input edit-exercise">${exOptions}</select>
              </div>
              <div class="rows" id="groupEditRows"></div>
              <button type="button" class="add-set-btn" id="groupAddSetBtn">+ Add set</button>
              <div class="row-actions" style="margin-top:8px;">
                <button type="button" class="icon-btn save-edit-btn" title="Save">✓</button>
                <button type="button" class="icon-btn cancel-edit-btn" title="Cancel">×</button>
              </div>
            </div>
          </td>
        `;
        const rowsContainer = $("#groupEditRows", tr);
        let currentEx = ex;
        g.sets.forEach(s => buildGroupEditRow(rowsContainer, currentEx, s));

        $("#groupAddSetBtn", tr).addEventListener("click", () => buildGroupEditRow(rowsContainer, currentEx, null));
        $(".edit-exercise", tr).addEventListener("change", (evt) => {
          currentEx = state.EXERCISES.find(x => x.name === evt.target.value) || currentEx;
          const snapshot = $all(".set-row", rowsContainer).map(row => ({
            weight: $(".weight-input", row) ? $(".weight-input", row).value : "",
            reps: $(".reps-input", row) ? $(".reps-input", row).value : "",
          }));
          rowsContainer.innerHTML = "";
          snapshot.forEach(s => buildGroupEditRow(rowsContainer, currentEx, {
            weight: s.weight !== "" ? parseFloat(s.weight) : null,
            reps: s.reps !== "" ? parseFloat(s.reps) : null,
            id: null,
          }));
        });
        $(".save-edit-btn", tr).addEventListener("click", () => saveEditedGroup(g, tr));
        $(".cancel-edit-btn", tr).addEventListener("click", () => { state.editingGroupKey = null; render(); });
      } else {
        tr.innerHTML = `
          <td>${fmtDate(g.date)}</td>
          <td>${g.exercise}</td>
          <td>${renderSetsCell(g.sets, ex)}</td>
          <td class="row-actions"><button type="button" class="icon-btn edit-entry-btn" title="Edit">✎</button></td>
        `;
        $(".edit-entry-btn", tr).addEventListener("click", () => { state.editingGroupKey = g.key; render(); });
      }

      fullBody.appendChild(tr);
    });
  }

  if (state.currentView === "progress") renderCharts();
  if (state.currentView === "calendar") renderCalendar();
  if (state.currentView === "suggested") renderSuggested();
}

// Builds one editable weight+reps set-row inside a group's expanded edit
// form. `existingSet` (an entry, or {weight,reps,id:null} snapshot, or
// null for a brand-new set) prefills the fields; row.dataset.entryId
// records which entry it maps to so save can tell edits from inserts.
function buildGroupEditRow(container, ex, existingSet) {
  const row = document.createElement("div");
  row.className = "set-row" + (ex.repsOnly ? " reps-only" : "");
  row.dataset.entryId = existingSet && existingSet.id ? existingSet.id : "";

  if (!ex.repsOnly) {
    const min = ex.min ?? 0;
    const step = ex.step ?? 1;
    const weightVal = existingSet && existingSet.weight !== null && existingSet.weight !== undefined ? existingSet.weight : "";
    const weightWrap = document.createElement("div");
    weightWrap.innerHTML = `
      <label class="field-label">Weight (kg)</label>
      <input type="number" class="weight-input" min="${min}" step="${step}" value="${weightVal}">
    `;
    row.appendChild(weightWrap);
  }

  const repsVal = existingSet && existingSet.reps !== null && existingSet.reps !== undefined ? existingSet.reps : "";
  const repsWrap = document.createElement("div");
  if (ex.repsOnly) {
    repsWrap.innerHTML = `<label class="field-label">Reps</label><input type="number" class="reps-input" min="1" step="1" value="${repsVal}">`;
  } else {
    let opts = '<option value="">Reps</option>';
    for (let i = 1; i <= 30; i++) opts += `<option value="${i}" ${String(i) === String(repsVal) ? "selected" : ""}>${i}</option>`;
    repsWrap.innerHTML = `<label class="field-label">Reps</label><select class="reps-input">${opts}</select>`;
  }
  row.appendChild(repsWrap);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "icon-btn";
  removeBtn.title = "Remove set";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", () => row.remove());
  row.appendChild(removeBtn);

  container.appendChild(row);
  return row;
}

async function saveEditedGroup(g, tr) {
  const date = $(".edit-date", tr).value;
  if (!date) {
    alert("Pick a date.");
    return;
  }
  const exercise = $(".edit-exercise", tr).value;
  const ex = state.EXERCISES.find(x => x.name === exercise);

  const rows = $all(".set-row", tr);
  const keptIds = new Set();
  const upserts = [];
  const baseTime = Date.now();
  let offset = 0;

  rows.forEach(row => {
    const repsEl = $(".reps-input", row);
    const reps = repsEl.value !== "" ? parseFloat(repsEl.value) : null;
    let weight = null;
    if (!ex.repsOnly) {
      const weightEl = $(".weight-input", row);
      weight = weightEl.value !== "" ? parseFloat(weightEl.value) : null;
    }
    if (reps === null || isNaN(reps)) return;

    const existingId = row.dataset.entryId;
    if (existingId) {
      const entry = state.entries.find(e => e.id === existingId);
      if (entry) {
        entry.date = date;
        entry.exercise = exercise;
        entry.weight = weight;
        entry.reps = reps;
        upserts.push(entry);
        keptIds.add(existingId);
      }
    } else {
      const newEntry = {
        id: `${baseTime + offset}-${Math.random().toString(36).slice(2, 8)}`,
        date, exercise, weight, reps,
        loggedAt: baseTime + offset,
      };
      offset += 1;
      state.entries.push(newEntry);
      upserts.push(newEntry);
      keptIds.add(newEntry.id);
    }
  });

  const removedIds = g.sets.map(s => s.id).filter(id => !keptIds.has(id));
  state.entries = state.entries.filter(e => !removedIds.includes(e.id));

  if (upserts.length) await saveEntries(upserts);
  if (removedIds.length) await deleteEntries(removedIds);

  state.editingGroupKey = null;
  render();
}
