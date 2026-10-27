<<<<<<< HEAD
# Setup from zero (Windows)

## 1. Tools
* Node.js 20+ (https://nodejs.org). Check: `node -v`
* Git. Check: `git --version`
* g++ (optional, for the C++ part): install MSYS2 or WinLibs and add its `bin` folder to PATH. Check: `g++ --version`

## 2. Supabase (done once)
1. Create a project. In **SQL Editor** run the three files in `supabase/migrations/` in order (01, 02, 03). Run each only once.
2. **Project settings -> API Keys**: copy the project URL, the publishable key and the secret key.

## 3. Local run
```
copy .env.example .env.local        (then edit .env.local and paste the three values; no spaces around =, no # comments after a value)
npm install
npm run build:engine                (optional, needs g++)
npm run db:seed                     (500 students + admin; takes about a minute)
npm run dev
```
Open http://localhost:3000, log in with `EN26100001` / `EN26100001`; staff at http://localhost:3000/admin/login with `admin` / `Admin@123`.

"The server is not configured yet" means a variable in `.env.local` (or in Render's Environment tab) is missing; the terminal/log line
`[config] Missing environment variable ...` names it. After editing `.env.local` stop `npm run dev` (Ctrl+C) and start it again.

## 4. Push to GitHub
Your repository already has commits, so a plain push is rejected. Either merge first:
```
git pull origin main --allow-unrelated-histories
git push -u origin main
```
or, if this folder is the complete and correct version and you want to replace what is on GitHub:
```
git push -u origin main --force
```
(`--force` overwrites the remote history.) `.env.local` is in `.gitignore` and is never uploaded.

## 5. Render
New -> Web Service -> your repository. Runtime Node, build `npm ci --include=dev && npm run build`, start `npm start`, health check
path `/api/health`. Add the four environment variables from `.env.example` (without the optional ones). Deploy, then check
`/api/health` and `/api/health/engine`.
=======
# Setup from zero (Windows + VS Code, beginner friendly)

Everything below is done by **you**, with **your own** accounts. Nothing here was executed on your Supabase, GitHub or Render accounts.
Each step says *where* to type the command. "Terminal" means the terminal inside VS Code (menu **Terminal -> New Terminal**), opened in the project folder.

## Part 1 - Install the tools (once)

1. **Node.js 22 LTS**: download from nodejs.org, install with the defaults. Check in a terminal: `node -v` (must show v20.9 or higher).
2. **VS Code**: code.visualstudio.com. Optional extension: *ESLint*.
3. **A C++ compiler (needed for the engine)**. Easiest on Windows: install **MSYS2** (msys2.org), open "MSYS2 UCRT64", run `pacman -S mingw-w64-ucrt-x86_64-gcc`, then add `C:\msys64\ucrt64\bin` to your Windows PATH (Start -> "Edit environment variables"). Open a **new** terminal and check: `g++ --version`.
4. **Git** (git-scm.com), only needed for GitHub/Render in Part 5.

## Part 2 - Open the project

5. Unzip the project, e.g. to `C:\Projects\admitqueue`.
6. VS Code -> **File -> Open Folder** -> choose that folder.
7. Terminal -> New Terminal. Run (project folder):
   ```
   npm install
   ```

## Part 3 - Create your Supabase project

8. Go to supabase.com, sign up, **New project**. Choose a region near you and a strong database password (save it).
9. **Project settings -> API Keys**: copy the **Project URL**, the **Publishable key** (`sb_publishable_...`) and the **Secret key** (`sb_secret_...`). Keep the secret key private.
10. **Authentication -> Sign In / Providers -> Email**: keep it enabled. Decide on **Confirm email**: ON is the realistic setting (students confirm their e-mail after registering); OFF is easier for a classroom demo.
11. **Authentication -> URL Configuration**: Site URL = `http://localhost:3000` for now; add redirect URL `http://localhost:3000/auth/callback`. After deploying, add your Render address too (Part 5).
12. Create the tables. Two ways, pick one:
    * **SQL editor (no extra setup):** Supabase -> **SQL Editor** -> New query. Open each file in `supabase/migrations/` **in name order** (`..._schema.sql`, then `..._functions.sql`, then `..._security.sql`), paste, **Run**. Each must finish with "Success".
    * **Script:** Project settings -> Database -> copy the *connection string* (URI), put it in `.env.local` as `SUPABASE_DB_URL` (step 14), then run `npm run db:migrate`.

## Part 4 - Run it on your computer

13. In the VS Code explorer, copy `.env.example` to a new file named `.env.local`.
14. Edit `.env.local` and fill in: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `DEMO_MODE=true`, and choose `ADMIN_LOGIN_ID` (e.g. `admin`), `ADMIN_EMAIL` (an address you can use), `ADMIN_PASSWORD` (12+ characters). **Never commit `.env.local`** (it is in `.gitignore`).
15. Build the C++ engine (project folder terminal):
    ```
    npm run build:engine
    ```
    You should see the engine build and a health check pass. If it says no compiler was found, redo step 3.
16. Run the C++ tests (optional but recommended): `npm run test:engine`.
17. Add the 500 fictional records (safe to run again):
    ```
    npm run db:seed
    ```
18. Create the admin account:
    ```
    npm run admin:bootstrap
    ```
19. Start the site:
    ```
    npm run dev
    ```
    Open http://localhost:3000.
20. **Try the student flow.** Click Register. Use CAP ID `DM26000001` (a seeded fictional record), any name, your e-mail, a password with letters and numbers. With `DEMO_MODE=true` the record links automatically; the dashboard shows the stored details. If "Confirm email" is ON, click the link in the e-mail first, then log in with the **CAP ID + password**.
21. **Try a new student**: register with CAP ID `NEW20260001`. The dashboard honestly says admission details are not available yet; preferences and documents still save.
22. **Try the admin**: http://localhost:3000/admin/login with your `ADMIN_LOGIN_ID` and password.
23. Check the engine: http://localhost:3000/api/health/engine should show `"ok":true`.

## Part 5 - Put it online (Render, no Docker)

24. Create a GitHub account, then a **new empty repository**. In the project terminal:
    ```
    git init
    git add .
    git commit -m "AdmitQueue"
    git branch -M main
    git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
    git push -u origin main
    ```
    Check that `.env.local` is **not** in the repository.
25. render.com -> sign up -> **New -> Blueprint** -> choose your repository (it reads `render.yaml`). Or **New -> Web Service**, runtime **Node**, build command `npm ci --include=dev && node scripts/build-engine.mjs --check && npm run build`, start command `npm start`, health check path `/api/health`.
26. Set the environment variables on Render (the same names as `.env.local`, with `NEXT_PUBLIC_APP_URL` = your Render address, e.g. `https://admitqueue.onrender.com`). Deploy.
    * If the build stops with "no C++ compiler found", the Render build image does not have g++: tell your instructor/mentor; the engine cannot run there until a compiler is available (the website itself would still work, engine features would show "engine unavailable").
27. After the deploy: open `/api/health` and `/api/health/engine` on your Render address (both must say `"ok":true`). Add the Render address to Supabase **URL Configuration** (Site URL + `/auth/callback`). In the Render **Shell** (or locally with the same `.env.local` values) run `npm run db:seed` and `npm run admin:bootstrap` once if you have not already (they work on the same Supabase project, so running them locally is enough).

Free Render services sleep when idle, so the first visit can take about a minute.

## Resetting the demo

`npm run db:reset-demo` removes fictional records nobody has claimed; add `-- --include-claimed` to remove all fictional data (claimed students lose their workspace). Then `npm run db:seed` again.

## When something goes wrong

* *"Missing environment variable"* - a value is missing in `.env.local`.
* *Login says "ID or password is incorrect"* - check you registered; if e-mail confirmation is on, confirm first.
* *"engine unavailable"* - run `npm run build:engine` and check `g++ --version`.
* *Port 3000 busy* - close the other program or run `npx next dev -p 3001` (then use 3001 in `NEXT_PUBLIC_APP_URL`).
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
