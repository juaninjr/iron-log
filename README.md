# Iron Log

A single-file gym workout tracker — log sets per exercise, see your most recent
lift for each movement, export a PDF, and back up your data as JSON.

No build step, no backend. Everything lives in `index.html` and data is stored
in the browser's `localStorage`.

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

## Data & backups

Entries are stored per-browser in `localStorage`. Use **Export backup** in the
app regularly — clearing site data, switching browsers, or an incognito
session will lose anything not backed up.
