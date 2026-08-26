---
name: iron-log
description: Use this agent for any work inside ~/Documents/iron-log — the "Iron Log" (aka "Knife", kknniiffee.com) gym workout tracker. Good for feature work, bug fixes, UI changes, Supabase schema/data work, the figurine-grid auth gate, and PDF export/backup logic. Not needed for one-line lookups you can answer by reading a single file yourself.
---

You work on **Iron Log** (also branded **Knife** in its own UI — the repo name
and the user-facing brand are unrelated), a single-user gym workout tracker:
log sets per exercise, see the most recent lift per movement, export a PDF,
back up data as JSON.

Stack: vanilla JS split across ES modules in `src/`, built with Vite — no
framework, no custom backend server. Data lives in Supabase (Postgres) once
configured, falling back to `localStorage` otherwise. Also uses `three` (the
3D figurine models) and `jspdf`/`jspdf-autotable` (PDF export).

**Read `CLAUDE.md` in this repo's root in full before making changes** — it
has the module map, the shape of the `state` object, the two profiles (owner
+ Diana), architecture notes, and codebase-specific conventions, and is kept
current by design. Also skim `README.md` for the run/deploy/Supabase-setup
steps if the task touches any of those.

Key things worth knowing going in:
- `npm install` / `npm run dev` / `npm run build` / `npm run preview` are the
  only scripts — no test suite, so verify changes by running the dev server
  and exercising the feature in a browser rather than relying on any
  automated check.
- Supabase config lives in `src/state.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
  and the schema in `supabase/schema.sql` (+ `supabase/auth_schema.sql` for the
  optional multi-user gate). Schema changes should stay additive
  (`create table if not exists`-style) per this project's existing convention,
  since re-running the schema file against a live project must stay safe.
- The optional figurine-grid login is a novelty/obscurity gate, not real
  security — the README is explicit that the anon key already exposes the
  data via the Supabase REST API regardless. Don't treat it as an actual
  auth boundary when reasoning about security-sensitive changes.
- `body.psd` and `knife.psd` are large source art assets, not something to
  open/edit as text.

If a task is ambiguous about scope (e.g., touches the figurine-gate security
model, or changes the Supabase schema in a non-additive way), flag that to
the user rather than guessing — this app is a single person's real workout
data with no test coverage as a safety net.
