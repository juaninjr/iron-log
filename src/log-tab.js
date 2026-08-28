import { state, activeProfile } from "./state.js";
import { $, $all, fmtDate, fmtRelativeDays, cssEscape, triggerHaptic, todayISO, showToast } from "./dom-utils.js";
import { saveEntries, deleteEntries, saveTodayPlan } from "./persistence.js";
import { renderCharts } from "./progress-tab.js";
import { renderCalendar } from "./calendar-tab.js";
import { renderSuggested, jumpToExercise } from "./suggested-tab.js";
import { toggleNavMenu } from "./nav.js";

// Rebuilds the two muscle-scoped Set filters (state.js) off the active
// profile's own muscle list — those Sets are built once at module-load
// time (always off the owner's list, since no profile is chosen yet at
// that point), so a non-owner profile needs them rebuilt right after
// gate.js picks it, before init() renders anything.
export function resetProfileFilters() {
  state.weightFilterSelected = new Set(activeProfile().muscles);
  state.repsFilterSelected = new Set(activeProfile().muscles);
}

// ---------- Header title ----------
// The header's brand slot shows each page's own plain name, not the
// "Knife" wordmark — that's the gate/login screen's brand moment
// (gate.js's bootstrap()), not something repeated on every subpage.
// `title` is the text to show, or null to clear the slot entirely (used
// when the page's own content already carries an equivalent heading
// right below it, so a header title would just repeat it — e.g. the
// Today's Workout page's gray box already has its own "Today's Workout"
// <h2>). setView() (nav.js) calls this with the right value per view;
// showTodayWorkoutPage() (below) is the Log tab's own case.
export function setHeaderTitle(title) {
  $("#headerLogoSlot").innerHTML = title ? `<span class="page-title--brand">${title}</span>` : "";
}

// ---------- Today's Workout plan ----------
// Exercise names picked via the pickers below, before any sets are
// actually logged for them — see state.js's todayPlan/todayPlanDate and
// persistence.js's loadTodayPlan()/saveTodayPlan(). Standard "mutate
// state first, then await persistence, then re-render" pattern.
export async function addToTodayPlan(name) {
  if (state.todayPlan.includes(name)) return;
  state.todayPlan = state.todayPlan.concat(name);
  if (!state.todayPlanDate) state.todayPlanDate = todayISO();
  await saveTodayPlan();
  rebuildCurrentPicker();
  if (!$("#logMainStage").hidden) { buildExerciseBlocks(); buildAllExercisesList(); render(); }
}

export async function removeFromTodayPlan(name) {
  if (!state.todayPlan.includes(name)) return;
  state.todayPlan = state.todayPlan.filter(n => n !== name);
  await saveTodayPlan();
  rebuildCurrentPicker();
  if (!$("#logMainStage").hidden) { buildExerciseBlocks(); buildAllExercisesList(); render(); }
}

// ---------- Muscle-select stage (the gate in front of the Log page) ----------
// The 3D model (wheel3d.js) spins for feel and is fully hoverable/tappable
// (see wheel3d.js); this row of buttons is both a fallback picker for
// parts that don't hover cleanly (or touch devices) and, via the
// mouseenter/mouseleave pair below, the button side of a two-way hover
// with the model — hovering a button highlights the matching 3D part, and
// vice versa (the "musclehover" listener in enterMuscleGate()). See
// legacy/muscle-wheel-2d-backup.md for the old spinning-dial-as-picker
// version this replaced. --muscle-color is read by style.css's
// .muscle-pick-btn hover rule so the button's hover color matches the 3D
// model's own per-muscle emissive glow (wheel3d.js) instead of one flat
// brand color for every muscle.
export function buildMusclePickRow() {
  const row = $("#musclePickRow");
  const cardioRow = $("#cardioPickRow");
  if (!row) return;
  row.innerHTML = "";
  if (cardioRow) cardioRow.innerHTML = "";
  const { muscles, muscleLabels, muscleColors } = activeProfile();
  muscles.forEach(m => {
    // Cardio isn't a body region the 3D model has geometry for — it gets
    // its own row underneath instead of sitting alongside Chest/Back/etc.,
    // which implied a hover it could never deliver. Same button markup
    // either way, just a different target container.
    const target = (m === "cardio" && cardioRow) ? cardioRow : row;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "muscle-pick-btn";
    btn.textContent = muscleLabels[m];
    btn.dataset.muscle = m;
    btn.style.setProperty("--muscle-color", muscleColors[m]);
    btn.addEventListener("mouseenter", () => { if (window.IronLogWheel3D) window.IronLogWheel3D.hoverMuscle(m); });
    btn.addEventListener("mouseleave", () => { if (window.IronLogWheel3D) window.IronLogWheel3D.hoverMuscle(null); });
    btn.addEventListener("click", () => {
      triggerHaptic();
      confirmMuscleSelection(m);
    });
    target.appendChild(btn);
  });
}

// The nav dropdown's "Log" item has a tap-to-expand browser (native
// <details>, no custom open/close JS) listing every exercise grouped by
// muscle — nested <details> per muscle, one button per exercise. Only
// depends on state.EXERCISES, so it's rebuilt wherever that already gets
// rebuilt (main.js's init(), addExercise()/renameExercise()/
// deleteExerciseFlow() in exercises-tab.js), not on every dropdown open.
export function buildLogNavBrowser() {
  const container = $("#navLogMuscleList");
  if (!container) return;
  container.innerHTML = "";
  const { muscles, muscleLabels, muscleColors } = activeProfile();
  muscles.forEach(m => {
    const exercises = state.EXERCISES.filter(ex => ex.muscle === m);
    if (exercises.length === 0) return;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.className = "muscle-summary";
    summary.textContent = muscleLabels[m];
    summary.style.color = muscleColors[m];
    details.appendChild(summary);
    exercises.forEach(ex => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-ex-btn";
      btn.textContent = ex.name;
      btn.addEventListener("click", () => {
        jumpToExercise(ex.name);
        toggleNavMenu(false);
      });
      details.appendChild(btn);
    });
    container.appendChild(details);
  });
}

// Three stages share #viewLog, only one visible at a time: the wheel
// (#muscleSelectStage) → picking a muscle (or "Create Plan") lands on an
// exercise picker (#quickLogStage, add-only, no inputs) → its back icon
// (showTodayWorkoutPage) reaches the full Today's Workout page
// (#logMainStage). This helper shows that page's header/nav chrome,
// shared by every way of reaching it.
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

// ---------- Exercise picker (wheel taps) ----------
// Which muscle the #quickLogStage picker currently showing is scoped to —
// null while it isn't showing. Re-derived from state.EXERCISES on every
// rebuild rather than snapshotting a list, so it can't go stale if
// exercises change.
let currentPickerMuscle = null;

function rebuildCurrentPicker() {
  if (currentPickerMuscle === null) return;
  if (currentPickerMuscle === "cardio") buildCardioPicker("#quickLogPickerList");
  else buildPickerList("#quickLogPickerList", state.EXERCISES.filter(ex => ex.muscle === currentPickerMuscle));
}

// Cardio's own quick-log picker — a "what type" dropdown (Run, Row, …)
// instead of buildPickerList()'s one-button-per-exercise list, since
// picking among a handful of cardio exercises reads more naturally as one
// choice than as a button grid. Metrics (distance/time) are unchanged —
// still entered later on the Today's Workout page, same as every other
// exercise; this only adds/removes plan membership, same as
// buildPickerList()'s Add/Added ✓ toggle.
let cardioPickerSelected = null;

function buildCardioPicker(containerSel) {
  const container = $(containerSel);
  if (!container) return;
  container.innerHTML = "";

  const exercises = state.EXERCISES.filter(ex => ex.muscle === "cardio");
  if (exercises.length === 0) {
    container.innerHTML = `<p class="empty-note">No cardio exercises yet.</p>`;
    return;
  }
  if (!cardioPickerSelected || !exercises.some(ex => ex.name === cardioPickerSelected)) {
    cardioPickerSelected = exercises[0].name;
  }

  const wrap = document.createElement("div");
  wrap.className = "cardio-type-picker";
  wrap.style.setProperty("--ex-muscle-color", activeProfile().muscleColors.cardio);

  const select = document.createElement("select");
  select.className = "cardio-type-select edit-input";
  select.setAttribute("aria-label", "Cardio type");
  exercises.forEach(ex => {
    const opt = document.createElement("option");
    opt.value = ex.name;
    opt.textContent = ex.name;
    select.appendChild(opt);
  });
  select.value = cardioPickerSelected;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "plan-pick-toggle";
  function syncToggle() {
    const added = state.todayPlan.includes(select.value);
    toggle.textContent = added ? "Added ✓" : "Add";
    toggle.classList.toggle("added", added);
  }
  select.addEventListener("change", () => { cardioPickerSelected = select.value; syncToggle(); });
  toggle.addEventListener("click", () => {
    triggerHaptic();
    if (state.todayPlan.includes(select.value)) removeFromTodayPlan(select.value);
    else addToTodayPlan(select.value);
  });
  syncToggle();

  wrap.appendChild(select);
  wrap.appendChild(toggle);
  container.appendChild(wrap);
}

// Plain add/remove buttons, no weight/reps inputs — actual logging
// happens on the Today's Workout main page instead. Each button toggles
// membership in state.todayPlan directly. Shared by the wheel's
// muscle-scoped picker (#quickLogPickerList) and the main page's own
// unfiltered "All exercises" list (#allExercisesList) — same rendering
// either way, just a different container and exercise list.
function buildPickerList(containerSel, exercises) {
  const container = $(containerSel);
  if (!container) return;
  container.innerHTML = "";

  if (exercises.length === 0) {
    container.innerHTML = `<p class="empty-note">No exercises here yet.</p>`;
    return;
  }

  exercises.forEach(ex => {
    const item = document.createElement("div");
    item.className = "plan-pick-item";
    item.style.setProperty("--ex-muscle-color", activeProfile().muscleColors[ex.muscle]);

    const name = document.createElement("span");
    name.className = "plan-pick-name";
    name.textContent = ex.name;
    item.appendChild(name);

    const added = state.todayPlan.includes(ex.name);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "plan-pick-toggle" + (added ? " added" : "");
    toggle.textContent = added ? "Added ✓" : "Add";
    toggle.addEventListener("click", () => {
      triggerHaptic();
      if (state.todayPlan.includes(ex.name)) removeFromTodayPlan(ex.name);
      else addToTodayPlan(ex.name);
    });
    item.appendChild(toggle);

    container.appendChild(item);
  });
}

// The main page's own unfiltered exercise list — every exercise, same
// add/remove toggle buttons as the wheel's picker. This is what actually
// builds "Today's Workout" (buildExerciseBlocks()) up: adding here just
// marks membership, no reps/weight needed yet.
export function buildAllExercisesList() {
  buildPickerList("#allExercisesList", state.EXERCISES);
}

function showPickerStage() {
  $("#muscleSelectStage").hidden = true;
  $("#logMainStage").hidden = true;
  $("#quickLogStage").hidden = false;
  $("header.top").hidden = true;
  $("#mainTabs").hidden = true;
  document.body.classList.remove("muscle-gate-active");
  document.body.classList.add("quick-log-active");
  if (window.IronLogWheel3D) window.IronLogWheel3D.hide();
}

// Tapping a muscle on the wheel (or clicking its button-row fallback)
// opens that one muscle's exercise picker — a quick shortcut; every
// exercise is always reachable from the main page's own "All exercises"
// list too (see showTodayWorkoutPage()/buildAllExercisesList() above).
export function confirmMuscleSelection(m) {
  currentPickerMuscle = m;
  $("#quickLogTitle").textContent = activeProfile().muscleLabels[m];
  showPickerStage();
  rebuildCurrentPicker();
}

// The picker's back icon, "Train more", "Create Plan" (the wheel page's
// house/knives button), and jumpToExercise() (suggested-tab.js) all land
// here — the Today's Workout main page: the gray Today's Workout box
// (today's plan, with real inputs), stats (collapsed by default), and the
// full "All exercises" add list below.
export function showTodayWorkoutPage() {
  currentPickerMuscle = null;
  leaveMuscleGate();
  setHeaderTitle(null);
  buildExerciseBlocks();
  buildAllExercisesList();
  render();
}

export function enterMuscleGate() {
  currentPickerMuscle = null;
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
// One block per exercise currently in state.todayPlan — the only place
// exercise blocks with weight/reps inputs render now (the pickers above
// only add/remove plan membership). Stays populated after a set is
// logged (filtering is plan-membership, not log-status), so you can keep
// adding sets to the same exercise later in the day.
export function buildExerciseBlocks() {
  const container = $("#exerciseBlocks");
  if (!container) return;
  container.innerHTML = "";
  const visible = state.EXERCISES.filter(ex => state.todayPlan.includes(ex.name));

  if (visible.length === 0) {
    container.innerHTML = `<p class="empty-note">No exercises in today's plan yet — head back to the wheel and add some.</p>`;
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

    const actions = document.createElement("div");
    actions.className = "ex-head-actions";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-set-btn";
    addBtn.textContent = "+ Add set";
    addBtn.addEventListener("click", () => addSetRow(rows, ex));
    actions.appendChild(addBtn);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-btn";
    removeBtn.title = "Remove from today's workout";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => removeFromTodayPlan(ex.name));
    actions.appendChild(removeBtn);

    head.appendChild(actions);
    container.appendChild(block);
  });
}

export function addSetRow(rowsContainer, ex) {
  const row = document.createElement("div");

  if (ex.cardio) {
    row.className = "set-row"; // same 3-column grid (distance/duration/remove) as the default weighted layout
    row.innerHTML = `
      <div>
        <label class="field-label">Distance (km)</label>
        <input type="number" class="distance-input" min="0" step="0.1" placeholder="km">
      </div>
      <div>
        <label class="field-label">Time (min)</label>
        <input type="number" class="duration-input" min="0" step="1" placeholder="min">
      </div>
    `;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-btn";
    removeBtn.title = "Remove set";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      if (rowsContainer.children.length > 1) row.remove();
      else $all("input", row).forEach(el => { el.value = ""; });
    });
    row.appendChild(removeBtn);
    rowsContainer.appendChild(row);
    return;
  }

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

export async function logWorkout() {
  const date = $("#workoutDate").value;
  if (!date) {
    alert("Pick a date first.");
    return;
  }

  const container = $("#exerciseBlocks");
  const newEntries = [];
  let offset = 0;
  const baseTime = Date.now();

  state.EXERCISES.forEach((ex) => {
    const block = container && $(`.exercise-block[data-exercise="${cssEscape(ex.name)}"]`, container);
    if (!block) return; // not in today's plan — nothing to read
    const rows = $all(".set-row", block);
    rows.forEach((row) => {
      if (ex.cardio) {
        const distEl = $(".distance-input", row);
        const durEl = $(".duration-input", row);
        const distance = distEl.value !== "" ? parseFloat(distEl.value) : null;
        const duration = durEl.value !== "" ? parseFloat(durEl.value) : null;
        const hasData = (distance !== null && !isNaN(distance)) || (duration !== null && !isNaN(duration));
        if (!hasData) return;

        newEntries.push({
          id: `${baseTime + offset}-${Math.random().toString(36).slice(2, 8)}`,
          date,
          exercise: ex.name,
          weight: null,
          reps: null,
          distance: (distance !== null && !isNaN(distance)) ? distance : null,
          duration: (duration !== null && !isNaN(duration)) ? duration : null,
          loggedAt: baseTime + offset,
        });
        offset += 1;
        return;
      }

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
        distance: null,
        duration: null,
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

  // Logged exercises come off today's plan — plan membership means "still
  // to log," not "ever logged today," so once a set's actually saved for
  // one, its block has done its job and clears out; anything left with no
  // input this round (a block that was skipped) stays put for later. No
  // scroll/snap to whatever's left — just a toast confirming the save.
  const loggedNames = new Set(newEntries.map(e => e.exercise));
  state.todayPlan = state.todayPlan.filter(n => !loggedNames.has(n));
  await saveTodayPlan();

  buildExerciseBlocks();
  buildAllExercisesList();
  $("#workoutDate").value = date;
  render();

  $("#logToast").textContent = `Logged ${newEntries.length} set${newEntries.length === 1 ? "" : "s"} correctly!`;
  showToast("logToast", 2200);
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
    if (ex && ex.cardio) {
      return `${sep}<span class="set-item"><span class="set-weight">${s.distance !== null ? s.distance + "km" : "—"}</span><span class="set-reps">${s.duration !== null ? s.duration + "min" : "—"}</span></span>`;
    }
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
    if (ex && ex.cardio) return `${s.distance !== null ? s.distance + "km" : "—"} · ${s.duration !== null ? s.duration + "min" : "—"}`;
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

  // Latest by exercise — just how long ago each was last trained, not
  // what was logged (that detail lives in the Full log below instead).
  const latestList = $("#latestList");
  latestList.innerHTML = "";
  latestByExercise().forEach(({ ex, date }) => {
    const row = document.createElement("div");
    row.className = "latest-list-item";
    row.style.setProperty("--ex-muscle-color", activeProfile().muscleColors[ex.muscle]);
    const name = ex.name + (ex.perHand ? ' <span class="per-hand-note">(per hand)</span>' : '');
    row.innerHTML = `<span class="latest-list-name">${name}</span><span class="latest-list-when">${fmtRelativeDays(date)}</span>`;
    latestList.appendChild(row);
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
            distance: $(".distance-input", row) ? $(".distance-input", row).value : "",
            duration: $(".duration-input", row) ? $(".duration-input", row).value : "",
          }));
          rowsContainer.innerHTML = "";
          snapshot.forEach(s => buildGroupEditRow(rowsContainer, currentEx, {
            weight: s.weight !== "" ? parseFloat(s.weight) : null,
            reps: s.reps !== "" ? parseFloat(s.reps) : null,
            distance: s.distance !== "" ? parseFloat(s.distance) : null,
            duration: s.duration !== "" ? parseFloat(s.duration) : null,
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
  row.dataset.entryId = existingSet && existingSet.id ? existingSet.id : "";

  if (ex.cardio) {
    row.className = "set-row";
    const distVal = existingSet && existingSet.distance !== null && existingSet.distance !== undefined ? existingSet.distance : "";
    const durVal = existingSet && existingSet.duration !== null && existingSet.duration !== undefined ? existingSet.duration : "";
    row.innerHTML = `
      <div>
        <label class="field-label">Distance (km)</label>
        <input type="number" class="distance-input" min="0" step="0.1" value="${distVal}">
      </div>
      <div>
        <label class="field-label">Time (min)</label>
        <input type="number" class="duration-input" min="0" step="1" value="${durVal}">
      </div>
    `;
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

  row.className = "set-row" + (ex.repsOnly ? " reps-only" : "");

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
    const existingId = row.dataset.entryId;
    let fields;

    if (ex.cardio) {
      const distEl = $(".distance-input", row);
      const durEl = $(".duration-input", row);
      const distance = distEl.value !== "" ? parseFloat(distEl.value) : null;
      const duration = durEl.value !== "" ? parseFloat(durEl.value) : null;
      if ((distance === null || isNaN(distance)) && (duration === null || isNaN(duration))) return;
      fields = { weight: null, reps: null, distance: !isNaN(distance) ? distance : null, duration: !isNaN(duration) ? duration : null };
    } else {
      const repsEl = $(".reps-input", row);
      const reps = repsEl.value !== "" ? parseFloat(repsEl.value) : null;
      let weight = null;
      if (!ex.repsOnly) {
        const weightEl = $(".weight-input", row);
        weight = weightEl.value !== "" ? parseFloat(weightEl.value) : null;
      }
      if (reps === null || isNaN(reps)) return;
      fields = { weight, reps, distance: null, duration: null };
    }

    if (existingId) {
      const entry = state.entries.find(e => e.id === existingId);
      if (entry) {
        entry.date = date;
        entry.exercise = exercise;
        Object.assign(entry, fields);
        upserts.push(entry);
        keptIds.add(existingId);
      }
    } else {
      const newEntry = {
        id: `${baseTime + offset}-${Math.random().toString(36).slice(2, 8)}`,
        date, exercise, ...fields,
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
