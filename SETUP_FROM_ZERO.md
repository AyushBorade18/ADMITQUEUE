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
