import jsPDF from "jspdf";
// Called as autoTable(doc, opts) rather than doc.autoTable(opts) — the
// functional form jspdf-autotable's own docs recommend for npm/bundler
// setups, since it doesn't depend on the plugin successfully
// prototype-patching the exact jsPDF class instance this file imports
// (its side-effect-import form bundles its own internal jsPDF copy for
// that patching step, which isn't guaranteed to be the same one).
import autoTable from "jspdf-autotable";
import { state, useSupabase, supabaseClient } from "./state.js";
import { todayISO, fmtDate } from "./dom-utils.js";
import { saveEntries } from "./persistence.js";
import { latestByExercise, groupedFullLog, formatSetsText, render } from "./log-tab.js";

// ---------- PDF export ----------
export function downloadPDF() {
  if (state.entries.length === 0) {
    alert("Nothing to export yet.");
    return;
  }
  const doc = new jsPDF();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Knife", 14, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Exported ${fmtDate(todayISO())}`, 14, 25);

  const latestRows = latestByExercise().map(({ ex, date, sets }) => [
    ex.name + (ex.perHand ? " (per hand)" : ""),
    date ? fmtDate(date) : "—",
    formatSetsText(sets, ex),
  ]);

  autoTable(doc, {
    startY: 32,
    head: [["Exercise", "Last date", "Sets (weight×reps)"]],
    body: latestRows,
    headStyles: { fillColor: [194, 59, 48] },
    styles: { fontSize: 9 },
  });

  const fullRows = groupedFullLog().map(g => [
    fmtDate(g.date),
    g.exercise,
    formatSetsText(g.sets, state.EXERCISES.find(x => x.name === g.exercise)),
  ]);

  doc.addPage();
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Full Log", 14, 18);

  autoTable(doc, {
    startY: 24,
    head: [["Date", "Exercise", "Sets (weight×reps)"]],
    body: fullRows,
    headStyles: { fillColor: [53, 80, 122] },
    styles: { fontSize: 8 },
  });

  doc.save(`knife-${todayISO()}.pdf`);
}

// ---------- Backup export/import ----------
export function exportBackup() {
  const blob = new Blob([JSON.stringify(state.entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `knife-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importBackup(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!Array.isArray(incoming)) throw new Error("Not an array");
      const existingIds = new Set(state.entries.map(e => e.id));
      const toAdd = [];
      incoming.forEach(e => {
        if (e && e.id && !existingIds.has(e.id)) {
          toAdd.push(e);
          existingIds.add(e.id);
        }
      });
      state.entries = state.entries.concat(toAdd);
      await saveEntries(toAdd);
      render();
      alert(`Imported ${toAdd.length} new set${toAdd.length === 1 ? "" : "s"}.`);
    } catch (err) {
      alert("Could not read that file — make sure it's a Knife backup JSON.");
    }
  };
  reader.readAsText(file);
}

export async function clearAllData() {
  const typed = prompt('This permanently erases every logged set — it cannot be undone. Export a backup first if you\'re not sure.\n\nType DELETE to confirm:');
  if (typed === null) return;
  if (typed.trim().toUpperCase() !== "DELETE") {
    alert('Not deleted — you must type "DELETE" exactly.');
    return;
  }
  if (useSupabase) {
    try {
      const { error } = await supabaseClient.from("workout_entries").delete().neq("id", "__none__");
      if (error) throw error;
    } catch (e) {
      console.error("Supabase clear error", e);
      alert("Could not clear the database.");
      return;
    }
    state.entries = [];
    render();
    return;
  }
  state.entries = [];
  await saveEntries();
  render();
}
