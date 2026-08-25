import { state, activeProfile, SVG_NS } from "./state.js";
import { $, fmtDate, fmtDateShort } from "./dom-utils.js";

// Best (max) value per date for each exercise: weight for weighted lifts,
// reps for reps-only ones — keeps every series on one consistent unit.
// Total volume per muscle group per date. "weight" sums weight×reps
// across weighted exercises (kg moved); "reps" sums reps across
// reps-only exercises — kept as a separate chart since it's a different
// unit (see the single-axis rule).
function muscleVolumeSeries(kind) {
  const { muscles, muscleLabels, muscleColors } = activeProfile();
  return muscles.map(m => {
    const byDate = {};
    state.entries.forEach(e => {
      const ex = state.EXERCISES.find(x => x.name === e.exercise);
      if (!ex || ex.muscle !== m) return;
      if (kind === "weight") {
        if (ex.repsOnly || e.weight === null || e.reps === null) return;
        byDate[e.date] = (byDate[e.date] || 0) + e.weight * e.reps;
      } else {
        if (!ex.repsOnly || e.reps === null) return;
        byDate[e.date] = (byDate[e.date] || 0) + e.reps;
      }
    });
    const points = Object.keys(byDate).sort().map(date => ({ date, value: byDate[date] }));
    return { key: m, label: muscleLabels[m], color: muscleColors[m], points };
  });
}

function buildChartFilters(container, seriesList, selected) {
  container.innerHTML = "";
  seriesList.forEach(({ key, label, color }) => {
    const wrap = document.createElement("label");
    wrap.className = "chart-check";
    wrap.innerHTML = `
      <input type="checkbox" ${selected.has(key) ? "checked" : ""}>
      <span class="chart-swatch" style="background:${color}"></span>${label}
    `;
    wrap.querySelector("input").addEventListener("change", (evt) => {
      if (evt.target.checked) selected.add(key);
      else selected.delete(key);
      renderCharts();
    });
    container.appendChild(wrap);
  });
}

function drawLineChart(svg, tooltip, seriesAll, selected, opts) {
  const visible = seriesAll.filter(s => selected.has(s.key) && s.points.length > 0);
  const W = svg.clientWidth || 640;
  const H = svg.clientHeight || 320;
  const M = { top: 16, right: 16, bottom: 26, left: 54 };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = "";

  if (visible.length === 0) {
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", W / 2);
    text.setAttribute("y", H / 2);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "chart-empty");
    text.textContent = "No data for the selected exercises yet.";
    svg.appendChild(text);
    tooltip.hidden = true;
    return;
  }

  const allPoints = visible.flatMap(s => s.points);
  const xs = allPoints.map(p => new Date(p.date).getTime());
  const ys = allPoints.map(p => p.value);
  let minX = Math.min(...xs), maxX = Math.max(...xs);
  if (minX === maxX) { minX -= 86400000; maxX += 86400000; }
  let minY = Math.min(0, ...ys), maxY = Math.max(...ys);
  if (minY === maxY) maxY = minY + 1;
  maxY += (maxY - minY) * 0.1;

  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const xScale = t => M.left + ((t - minX) / (maxX - minX)) * plotW;
  const yScale = v => H - M.bottom - ((v - minY) / (maxY - minY)) * plotH;

  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const v = minY + (maxY - minY) * (i / yTicks);
    const y = yScale(v);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", M.left); line.setAttribute("x2", W - M.right);
    line.setAttribute("y1", y); line.setAttribute("y2", y);
    line.setAttribute("class", "chart-grid");
    svg.appendChild(line);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", M.left - 6);
    label.setAttribute("y", y + 3);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("class", "chart-axis-label");
    label.textContent = Math.round(v).toLocaleString();
    svg.appendChild(label);
  }

  const xTickCount = W < 480 ? 3 : 5;
  for (let i = 0; i < xTickCount; i++) {
    const t = minX + (maxX - minX) * (i / (xTickCount - 1));
    const x = xScale(t);
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", x);
    label.setAttribute("y", H - M.bottom + 16);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "chart-axis-label");
    label.textContent = fmtDateShort(new Date(t));
    svg.appendChild(label);
  }

  visible.forEach(s => {
    const d = s.points.map((p, i) => {
      const x = xScale(new Date(p.date).getTime());
      const y = yScale(p.value);
      return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", s.color);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);

    s.points.forEach(p => {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", xScale(new Date(p.date).getTime()));
      circle.setAttribute("cy", yScale(p.value));
      circle.setAttribute("r", 4);
      circle.setAttribute("fill", s.color);
      circle.setAttribute("stroke", "#ffffff");
      circle.setAttribute("stroke-width", "2");
      svg.appendChild(circle);
    });
  });

  const crosshair = document.createElementNS(SVG_NS, "line");
  crosshair.setAttribute("y1", M.top);
  crosshair.setAttribute("y2", H - M.bottom);
  crosshair.setAttribute("class", "chart-crosshair");
  crosshair.style.display = "none";
  svg.appendChild(crosshair);

  const overlay = document.createElementNS(SVG_NS, "rect");
  overlay.setAttribute("x", M.left);
  overlay.setAttribute("y", M.top);
  overlay.setAttribute("width", Math.max(plotW, 0));
  overlay.setAttribute("height", Math.max(plotH, 0));
  overlay.setAttribute("fill", "transparent");
  svg.appendChild(overlay);

  const mergedDates = [...new Set(allPoints.map(p => p.date))].sort();

  function showTooltip(evt) {
    const rect = svg.getBoundingClientRect();
    const mx = (evt.clientX - rect.left) * (W / rect.width);
    const t = minX + ((mx - M.left) / plotW) * (maxX - minX);

    let nearest = mergedDates[0], nearestDiff = Infinity;
    mergedDates.forEach(ds => {
      const diff = Math.abs(new Date(ds).getTime() - t);
      if (diff < nearestDiff) { nearestDiff = diff; nearest = ds; }
    });

    const x = xScale(new Date(nearest).getTime());
    crosshair.setAttribute("x1", x);
    crosshair.setAttribute("x2", x);
    crosshair.style.display = "";

    const rows = visible
      .map(s => {
        const p = s.points.find(pt => pt.date === nearest);
        return p ? { name: s.label, color: s.color, value: p.value } : null;
      })
      .filter(Boolean);

    if (rows.length === 0) {
      tooltip.hidden = true;
      return;
    }

    tooltip.innerHTML = `<div class="tt-date">${fmtDate(nearest)}</div>` + rows.map(r =>
      `<div class="tt-row"><span class="tt-swatch" style="background:${r.color}"></span>${r.name}<span class="tt-val">${Math.round(r.value).toLocaleString()}${opts.unit}</span></div>`
    ).join("");
    tooltip.hidden = false;
    const left = Math.min(Math.max(x - 60, 0), Math.max(W - 200, 0));
    tooltip.style.left = left + "px";
    tooltip.style.top = "8px";
  }

  overlay.addEventListener("mousemove", showTooltip);
  overlay.addEventListener("mouseleave", () => {
    tooltip.hidden = true;
    crosshair.style.display = "none";
  });
}

export function renderCharts() {
  const weightSeries = muscleVolumeSeries("weight");
  const repsSeries = muscleVolumeSeries("reps");

  buildChartFilters($("#weightFilters"), weightSeries, state.weightFilterSelected);
  buildChartFilters($("#repsFilters"), repsSeries, state.repsFilterSelected);

  drawLineChart($("#weightChart"), $("#weightTooltip"), weightSeries, state.weightFilterSelected, { unit: " kg" });
  drawLineChart($("#repsChart"), $("#repsTooltip"), repsSeries, state.repsFilterSelected, { unit: " reps" });
}
