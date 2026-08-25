# Iron Log

Also branded/known as **Knife** (kknniiffee.com) in the app's own UI —
this repo/project's name is unrelated to what users see.

A gym workout tracker — log sets per exercise, see your most recent lift for
each movement, export a PDF, and back up your data as JSON.

Vanilla JS split across ES modules in `src/`, built with Vite — no framework,
no custom backend server. Data is stored in [Supabase](https://supabase.com)
(Postgres) once configured (see below); until then it falls back to the
browser's `localStorage`.

## Run locally

```bash
npm install
npm run dev
```

Open the printed localhost URL. `npm run build` produces a production build
in `dist/`; `npm run preview` serves that build locally to sanity-check it
before deploying.

## Deploy to Vercel

1. Push this repo to GitHub (see below).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Framework preset: Vercel auto-detects **Vite** from `package.json` — no
   manual config needed. Root directory: `.`
4. Deploy.

## Push to GitHub

```bash
git remote add origin https://github.com/<juaninjr>/iron-log.git
git branch -M main
git push -u origin main
```

## Database setup (Supabase)

Iron Log is single-user with no login, so the database is protected only by
keeping its anon key out of source control review scrutiny for other data —
don't reuse this Supabase project for anything sensitive.

1. Create a free project at [supabase.com](https://supabase.com/dashboard).
2. Open **SQL Editor** in the project, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the
   `workout_entries` and `exercises` tables and a permissive access policy on
   each (see the comments in that file for why). The `exercises` table
   self-seeds with the default roster the first time the page loads.
   **If you already ran this file before the `exercises` table existed**,
   re-run it — the new statements are additive (`create table if not
   exists`), so it's safe to run again.
3. Open **Project Settings > API** and copy the **Project URL** and the
   **anon public** key.
4. In `src/state.js`, find these lines and fill in your values:
   ```js
   export const SUPABASE_URL = "YOUR_SUPABASE_URL";
   export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
   ```
5. Reload the page (or restart `npm run dev`). Iron Log will now read/write
   workouts from Supabase instead of `localStorage`.

If you skip this setup, the app keeps working exactly as before, using
`localStorage`.

## Optional: figurine-grid login + multi-user support

By default Iron Log has no login — anyone with the deployed URL uses the
same single "owner" dataset. There's an optional gate that adds:

- A 20×20 grid of figurine buttons on load. One specific cell is "correct,"
  validated **server-side only** (a Supabase Edge Function) — the correct
  cell is never sent to the browser in any form, so nothing in the page
  source reveals it. Click it to enter as the owner.
- Any wrong click locks the whole grid for 5 seconds, enforced by the
  server too (not just a client-side timer), so it can't be bypassed by
  editing browser state.
- An **"I'm a stranger"** button for a normal email/password signup — each
  stranger gets their own private data, isolated from the owner's and from
  every other stranger's via Postgres Row Level Security.

**This is an obscurity-based novelty gate, not real security for the
data.** The owner's workout data still lives behind the same public anon
key used everywhere else in this app — anyone who extracts that key from
the deployed page (trivial via browser dev tools) can already read/write it
directly via the Supabase REST API, with or without ever seeing the grid.
The grid gates the *page*, not the *data*. Don't use this for anything
sensitive.

To turn it on:

1. Run [`supabase/schema.sql`](supabase/schema.sql) first if you haven't
   already (see above).
2. Run [`supabase/auth_schema.sql`](supabase/auth_schema.sql) in the SQL
   editor. This adds per-user scoping to `workout_entries`/`exercises`, a
   `profiles` table for strangers, and two tables with **no** anon/
   authenticated policies at all (`owner_secret`, `figurine_attempts`) so
   only a service-role client can ever touch them.
3. Deploy the Edge Function: in the dashboard, **Edge Functions > New
   function**, name it `verify-figurine`, and paste in the contents of
   [`supabase/functions/verify-figurine/index.ts`](supabase/functions/verify-figurine/index.ts).
   (Or `supabase functions deploy verify-figurine` if you have the CLI
   linked to this project.) `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   are injected automatically — no extra secrets to configure.
4. Seed the correct cell. **Do not commit this value anywhere** — run it
   directly in the SQL editor as a one-off:
   ```sql
   insert into owner_secret (id, correct_cell) values (1, <the number Claude gave you in chat>)
   on conflict (id) do update set correct_cell = excluded.correct_cell, updated_at = now();
   ```
5. Confirm email/password auth is enabled: **Authentication > Providers >
   Email** should already be on by default.
6. In `src/state.js`, flip `export const GATE_ENABLED = false;` to `true` —
   only after steps 1–5 are done, or you'll lock yourself out of your own
   app with no working backend to unlock it.

## Data & backups

Once Supabase is configured, entries are stored in your Postgres database and
available from any browser/device. Without it, entries are stored per-browser
in `localStorage`. Either way, use **Export backup** in the app regularly —
data loss can still happen (dropped table, cleared site data, etc.) if you
don't back up.
