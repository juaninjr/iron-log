import { state } from "./state.js";
import { $, todayISO } from "./dom-utils.js";

export function renderCalendar() {
  const year = state.calMonth.getFullYear();
  const month = state.calMonth.getMonth();
  $("#calTitle").textContent = state.calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const exByDate = {};
  state.entries.forEach(e => {
    (exByDate[e.date] = exByDate[e.date] || new Set()).add(e.exercise);
  });

  const grid = $("#calGrid");
  grid.innerHTML = "";

  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(d => {
    const cell = document.createElement("div");
    cell.className = "cal-dow";
    cell.textContent = d;
    grid.appendChild(cell);
  });

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = todayISO();

  for (let i = 0; i < startOffset; i++) {
    const filler = document.createElement("div");
    filler.className = "cal-cell empty";
    grid.appendChild(filler);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (exByDate[iso]) cell.classList.add("trained");
    if (iso === todayIso) cell.classList.add("today");
    cell.textContent = day;
    if (exByDate[iso]) cell.title = Array.from(exByDate[iso]).join(", ");
    grid.appendChild(cell);
  }
}
