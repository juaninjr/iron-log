# Iron Log

A single-file gym workout tracker — log sets per exercise, see your most recent
lift for each movement, export a PDF, and back up your data as JSON.

No build step, no custom backend server. Everything lives in `index.html`.
Data is stored in [Supabase](https://supabase.com) (Postgres) once configured
(see below); until then it falls back to the browser's `localStorage`.

## Run locally

Just open `index.html` in a browser, or serve it:

```bash
npx serve .
```

## Deploy to Vercel

1. Push this repo to GitHub (see below).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Framework preset: **Other** (no build command needed). Root directory: `.`
4. Deploy.

## Push to GitHub

```bash
git remote add origin https://github.com/<your-username>/iron-log.git
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
   `workout_entries` table and a permissive access policy (see the comments
   in that file for why).
3. Open **Project Settings > API** and copy the **Project URL** and the
   **anon public** key.
4. In `index.html`, find these lines near the top of the `<script>` block and
   fill in your values:
   ```js
   const SUPABASE_URL = "YOUR_SUPABASE_URL";
   const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
   ```
5. Reload the page. Iron Log will now read/write workouts from Supabase
   instead of `localStorage`.

If you skip this setup, the app keeps working exactly as before, using
`localStorage`.

## Data & backups

Once Supabase is configured, entries are stored in your Postgres database and
available from any browser/device. Without it, entries are stored per-browser
in `localStorage`. Either way, use **Export backup** in the app regularly —
data loss can still happen (dropped table, cleared site data, etc.) if you
don't back up.
