# Deploy MisFinanzas Family to Vercel

Step-by-step guide to take this Next.js + Prisma app from your machine to a live Vercel URL.

**Why these steps?** Vercel runs **serverless** functions. A file-based SQLite DB (`prisma/dev.db`) cannot be used there — the filesystem is ephemeral. This project is configured for **PostgreSQL**, with migrations applied automatically on every production build.

---

## What you need

| Tool | Purpose |
|------|---------|
| [GitHub](https://github.com) account | Host the git repo (Vercel deploys from it) |
| [Vercel](https://vercel.com) account | Hosting + HTTPS + CI deploys |
| [Neon](https://neon.tech) free account *(recommended)* | Managed Postgres (works great with Vercel) |
| Node.js 20+ and npm | Local checks before push |
| Git | Version control |

Alternatives to Neon for Postgres: **Vercel Postgres**, **Supabase**, **Railway**, or any hosted Postgres. The steps below use **Neon** because it is free, has a pooled URL for serverless, and is one-click connectable from Vercel.

---

## Overview

```
1. Create a Postgres database (Neon)
2. Configure env vars locally (optional smoke test)
3. Push this repo to GitHub
4. Import the project in Vercel
5. Add environment variables in Vercel
6. Deploy
7. (Optional) Seed demo users / custom domain
```

---

## Step 1 — Create a PostgreSQL database (Neon)

1. Go to [https://console.neon.tech](https://console.neon.tech) and sign up / log in.
2. **Create a project** (e.g. name: `misfinanzas-family`).
3. Pick a region close to your users (or close to Vercel’s default region).
4. After the project is created, open **Dashboard → Connection details**.
5. Copy **two** connection strings:

   | Variable | Which Neon string | Notes |
   |----------|-------------------|--------|
   | `DATABASE_URL` | **Pooled** connection (often has `-pooler` in the host) | Used by the app at runtime |
   | `DIRECT_URL` | **Direct** connection (no pooler) | Used by `prisma migrate deploy` during build |

   Both look like:

   ```text
   postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
   ```

6. Keep these private. Never commit them to git.

> **Tip:** In Neon, the UI usually has a toggle or tabs for “Pooled” vs “Direct”. If you only see one string and it has no `-pooler`, you can set **both** `DATABASE_URL` and `DIRECT_URL` to that same value for low traffic.

---

## Step 2 — (Optional) Smoke-test locally against Postgres

On your machine:

```bash
cd misfinanzas-family
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="postgresql://...pooled...sslmode=require"
DIRECT_URL="postgresql://...direct...sslmode=require"
AUTH_SECRET="paste-a-long-random-secret-here"
```

Generate a secret:

```bash
openssl rand -base64 32
```

Then:

```bash
npm install
npx prisma migrate deploy
npm run db:seed    # optional: alice@familia.local / familia123
npm run build      # should finish without errors
npm run dev        # http://localhost:3000
```

If `build` succeeds, Vercel is very likely to succeed too.

---

## Step 3 — Put the code on GitHub

If this folder is not a git repo yet, or you only have local commits:

```bash
cd misfinanzas-family

# If needed:
# git init
# git branch -M main

git status
git add -A
git commit -m "Prepare app for Vercel deploy (Postgres + migrations)"

# Create an empty repo on GitHub (via UI or gh), then:
git remote add origin https://github.com/YOUR_USER/misfinanzas-family.git
git push -u origin main
```

Using the GitHub CLI:

```bash
gh repo create misfinanzas-family --private --source=. --remote=origin --push
```

**Do not commit** `.env`, `prisma/dev.db`, or any real secrets. They are already in `.gitignore`.

---

## Step 4 — Import the project in Vercel

1. Go to [https://vercel.com](https://vercel.com) and sign in (prefer **Continue with GitHub**).
2. Click **Add New… → Project**.
3. **Import** the `misfinanzas-family` repository.
4. Framework preset should be **Next.js** (auto-detected; also set in `vercel.json`).
5. Leave **Root Directory** as `.` unless the app lives in a subfolder.
6. **Do not deploy yet** — first add environment variables (next step).  
   If the UI forces you to continue, you can redeploy after adding env vars.

Build settings (defaults are fine):

| Setting | Value |
|---------|--------|
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output | Next.js (automatic) |

`npm run build` runs:

1. `prisma migrate deploy` — applies SQL migrations to your Postgres DB  
2. `next build` — builds the Next.js app  

`postinstall` already runs `prisma generate`.

---

## Step 5 — Environment variables in Vercel

In the project: **Settings → Environment Variables**.

Add these for **Production** (and **Preview** if you want PR previews to work):

| Name | Value | Notes |
|------|--------|--------|
| `DATABASE_URL` | Neon **pooled** URL | Required |
| `DIRECT_URL` | Neon **direct** URL | Required for migrations at build time |
| `AUTH_SECRET` | Long random string (`openssl rand -base64 32`) | Required; min 16 chars |

Optional AI features (receipts / statements):

| Name | Value |
|------|--------|
| `XAI_API_KEY` | Your xAI / Grok key |
| `GEMINI_API_KEY` | Or a Google Gemini key |
| `LLM_PROVIDER` | `auto` \| `grok` \| `gemini` |
| `LLM_MODEL` | Optional model override |

**Important:**

- Mark variables for **Build** and **Runtime** (Vercel’s UI: ensure they are available during the build, not only at runtime). Migrations run **during build**, so `DATABASE_URL` and `DIRECT_URL` must be present then.
- Use a **different** `AUTH_SECRET` than local development.
- After changing env vars, trigger a **Redeploy**.

### One-click Neon from Vercel (optional)

Vercel → Project → **Storage** / marketplace → **Neon** integration can create a DB and inject env vars for you. If it only sets `DATABASE_URL`, also set `DIRECT_URL` (from Neon’s direct connection string) so `prisma migrate deploy` works reliably.

---

## Step 6 — Deploy

1. Click **Deploy** (or **Redeploy** if the first attempt ran without env vars).
2. Watch the build log:
   - `prisma migrate deploy` should report applying `20260723000000_init` (or “No pending migrations”).
   - `next build` should complete successfully.
3. Open the production URL, e.g. `https://misfinanzas-family.vercel.app`.
4. Register a new account on `/register`, or seed demo users (next step).

Every later `git push` to the connected branch (usually `main`) triggers a new production deploy.

---

## Step 7 — (Optional) Seed the production database

Seeding is **not** automatic on deploy (on purpose — you do not want demo users wiped/recreated every deploy).

### Option A — From your machine (simplest)

Point local env at **production** URLs temporarily (careful!):

```bash
# Use a throwaway shell; do not commit these
export DATABASE_URL="your-production-pooled-url"
export DIRECT_URL="your-production-direct-url"
npm run db:seed
```

Demo logins after seed:

| Email | Password | Role |
|-------|----------|------|
| `alice@familia.local` | `familia123` | owner |
| `bob@familia.local` | `familia123` | member |

Change those passwords or delete demo users before sharing the app with family.

### Option B — Register normally

Open `/register` on the live site and create the first household yourself. No seed required.

---

## Step 8 — (Optional) Custom domain

1. Vercel project → **Settings → Domains**.
2. Add your domain (e.g. `finanzas.tudominio.com`).
3. Create the DNS records Vercel shows (usually a `CNAME` to `cname.vercel-dns.com`).
4. Wait for SSL to provision (automatic).

Session cookies already use `secure` when `NODE_ENV=production`, so HTTPS domains work with login.

---

## Checklist before you share the link

- [ ] Production `AUTH_SECRET` is strong and unique  
- [ ] `DATABASE_URL` + `DIRECT_URL` set for Production (and Preview if needed)  
- [ ] First deploy finished green in Vercel  
- [ ] You can register / log in  
- [ ] Demo seed passwords changed or unused  
- [ ] Optional: AI keys only if you want LLM receipt/statement extraction  

---

## Project files that make Vercel work

| File / setting | Role |
|----------------|------|
| `prisma/schema.prisma` | `provider = "postgresql"` + `url` / `directUrl` |
| `prisma/migrations/` | SQL applied by `prisma migrate deploy` |
| `package.json` → `build` | `prisma migrate deploy && next build` |
| `package.json` → `postinstall` | `prisma generate` |
| `vercel.json` | Explicit Next.js framework + build/install commands |
| `.env.example` | Template for local + production env names |

---

## Troubleshooting

### Build fails: `Environment variable not found: DATABASE_URL` / `DIRECT_URL`

Add both variables in Vercel → Settings → Environment Variables, enable them for the **Production** environment and for **Build**, then redeploy.

### Build fails during `prisma migrate deploy`

- Confirm `DIRECT_URL` is the **non-pooled** Neon URL.
- Confirm the DB allows connections from the internet (Neon does by default).
- Open the migration SQL under `prisma/migrations/` and ensure it was committed to git.

### App deploys but login always fails / “AUTH_SECRET must be set”

Set `AUTH_SECRET` (16+ characters) in Vercel and redeploy.

### `P1001: Can't reach database server`

Wrong host/password, or you used a local `localhost` URL in Vercel. Production must use the Neon (or other cloud) host.

### Preview deployments break, Production works

Copy the same env vars to the **Preview** environment, or use Neon branches if you want isolated DBs per PR.

### SQLite / `file:./dev.db` errors

Local `.env` may still point at the old SQLite file. This app no longer uses SQLite. Use Postgres URLs from `.env.example`.

### Large cold starts on ticket OCR

`tesseract.js` is heavy for serverless. Prefer pasting ticket text or enabling LLM keys (`XAI_API_KEY` / `GEMINI_API_KEY`) so extraction stays fast. PDF statement parsing runs in the browser (`pdfjs-dist`).

---

## Updating the app after the first deploy

```bash
# make changes locally
git add -A
git commit -m "Describe your change"
git push origin main
```

Vercel rebuilds automatically. If you change the Prisma schema:

```bash
npx prisma migrate dev --name describe_your_change
git add prisma/migrations prisma/schema.prisma
git commit -m "Add migration: describe_your_change"
git push origin main
```

The production build will run `prisma migrate deploy` and apply the new migration.

---

## Quick reference — minimum Vercel env

```env
DATABASE_URL=postgresql://...@...-pooler.../neondb?sslmode=require
DIRECT_URL=postgresql://...@.../neondb?sslmode=require
AUTH_SECRET=your-long-random-secret
```

That’s everything required to go live.
