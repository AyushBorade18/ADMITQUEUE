# AdmitQueue (demo)

A simple CAP admission demo: students log in with **CAP ID + password** and their saved details load automatically; staff use an
admin portal. Next.js + React (pages, login, security), Supabase (Auth + PostgreSQL), and a very small C++ program for
searching, sorting, queue/stack steps and the allotment.

It is a classroom project. It is not connected to the CET Cell or the official CAP portal, and all data is fictional.

## Demo logins

| Who | ID | Password |
|---|---|---|
| Student | `EN26100001` ... `EN26100500` | the same as the ID (e.g. `EN26100001`) |
| Admin (`/admin/login`) | `admin` | `Admin@123` |

All 500 students are listed in `demo-data/dummy_students_500.csv` (ID, name, category, merit rank, percentile, password,
documents verified, preferences). The admin account is a fixed dummy login; change its password in Supabase for anything real.

## First-time setup (once)

1. Supabase project with the three SQL files in `supabase/migrations/` already run (done for this project).
2. `.env.local` next to `package.json` (copy `.env.example`): the Supabase URL, publishable key and secret key.
3. In a terminal in the project folder:

```
npm install
npm run build:engine      # compiles cpp/ (needs g++; skip it if you have none, the site then uses a TypeScript copy)
npm run db:seed           # creates the 500 records, 500 student logins and the admin login in your Supabase project
npm run dev               # http://localhost:3000
```

`npm run db:seed` is safe to run again. If an old test left students with different passwords, run
`npm run db:seed -- --reset-passwords`. To wipe the demo data completely: `npm run db:reset-demo -- --include-claimed`, then seed again.

## Deploy on Render (no Docker)

* Build command: `npm ci --include=dev && npm run build`
* Start command: `npm start`
* Health check path: `/api/health`
* Environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_APP_URL` (your Render address).

The database is shared: once `npm run db:seed` has run from your computer, the same logins work on Render. After the first deploy open
`/api/health/engine`: `"mode":"cpp"` means the compiled C++ program runs on Render, `"mode":"typescript"` means Render had no
compiler and the TypeScript copy of the same steps answers (everything still works).

## Where things are

* `cpp/` simple C++ (see `cpp/README.md`), `FODS_MAPPING.md` which feature uses which data structure.
* `src/` website, `supabase/migrations/` database, `scripts/` seed and build scripts, `tests/` automated tests.
* Tests: `npm test` (unit, includes C++ vs TypeScript comparison). `npm run test:db` and `npm run test:e2e` need a local PostgreSQL;
  they use a Supabase emulator written for the tests, not a real Supabase project.
