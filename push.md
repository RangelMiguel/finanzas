# Deploy MisFinanzas Family to Vercel

Step-by-step guide to take this Next.js + Prisma app from your machine to a live Vercel URL.

**Package manager:** this project uses **pnpm** (not npm). Vercel installs with `pnpm install --frozen-lockfile` via `vercel.json` and `packageManager` in `package.json`.

**Why Postgres?** Vercel runs **serverless** functions. A file-based SQLite DB cannot be used there. Migrations run automatically during the production build.

---

## What you need

| Tool | Purpose |
|------|---------|
| [GitHub](https://github.com) account | Host the git repo (Vercel deploys from it) |
| [Vercel](https://vercel.com) account | Hosting + HTTPS + CI deploys |
| [Neon](https://neon.tech) free account *(recommended)* | Managed Postgres |
| Node.js 20+ and **pnpm 9** | Local checks before push |
| Git | Version control |

Enable pnpm locally (once):

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm --version   # expect 9.15.x
```

---

## Overview

```
1. Create a Postgres database (Neon)
2. Set env vars in Vercel (required before a green build)
3. Smoke-test locally with pnpm (optional)
4. Push to GitHub
5. Import / redeploy on Vercel
6. (Optional) Seed demo users / custom domain
```

---

## Step 1 — Create a PostgreSQL database (Neon)

1. Go to [https://console.neon.tech](https://console.neon.tech) and sign up / log in.
2. **Create a project** (e.g. name: `finanzas`).
3. Pick a region (US East is fine if Vercel builds in `iad1`).
4. Open **Dashboard → Connection details**.
5. Copy **two** connection strings:

   | Variable | Which Neon string | Notes |
   |----------|-------------------|--------|
   | `DATABASE_URL` | **Pooled** (`-pooler` in host) | App runtime on Vercel |
   | `DIRECT_URL` | **Direct** (no pooler) | `prisma migrate deploy` during build |

   Both look like:

   ```text
   postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
   ```

6. Never commit these to git.

> If you only have one string, set **both** `DATABASE_URL` and `DIRECT_URL` to it. The build script will also fall back `DIRECT_URL` → `DATABASE_URL` if `DIRECT_URL` is missing.

---

## Step 2 — Environment variables in Vercel (**do this first**)

Most failed deploys stop at `prisma migrate deploy` because the DB env vars are missing or not available **during the build**.

In the Vercel project: **Settings → Environment Variables**

| Name | Example / how to get it | Required |
|------|-------------------------|----------|
| `DATABASE_URL` | Neon **pooled** URL | **Yes** |
| `DIRECT_URL` | Neon **direct** URL | Yes (or same as `DATABASE_URL`) |
| `AUTH_SECRET` | `openssl rand -base64 32` | **Yes** (min 16 chars) |
| `XAI_API_KEY` / `GEMINI_API_KEY` | Optional LLM extraction | No |

For each variable:

1. Environment: at least **Production** (also **Preview** if you want PR previews).
2. Ensure it is available for **Build** and **Runtime** (not runtime-only).
3. Save, then **Redeploy**.

### Minimum set

```env
DATABASE_URL=postgresql://...@...-pooler.../neondb?sslmode=require
DIRECT_URL=postgresql://...@.../neondb?sslmode=require
AUTH_SECRET=your-long-random-secret
```

The custom build (`scripts/vercel-build.mjs`) fails **immediately** with a clear message if these are missing, instead of hanging on Prisma.

---

## Step 3 — (Optional) Smoke-test locally with pnpm

```bash
cd finanzas   # or misfinanzas-family
cp .env.example .env
# edit .env → DATABASE_URL, DIRECT_URL, AUTH_SECRET

corepack enable
pnpm install
pnpm exec prisma migrate deploy
pnpm run build      # migrate + next build
pnpm dev
```

Open http://localhost:3000

---

## Step 4 — Push to GitHub

```bash
git add -A
git status
# confirm: pnpm-lock.yaml is included; package-lock.json is NOT
# confirm: .env is NOT staged

git commit -m "Switch to pnpm and harden Vercel build"
git push origin main
```

**Must be in the repo for deploy:**

- `pnpm-lock.yaml`
- `package.json` with `"packageManager": "pnpm@9.15.9"`
- `vercel.json`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `scripts/vercel-build.mjs`

---

## Step 5 — Vercel project settings

1. [vercel.com](https://vercel.com) → import the GitHub repo (or open the existing project).
2. Framework: **Next.js** (auto).
3. Install / build are already set in `vercel.json`:

   | Setting | Value |
   |---------|--------|
   | Install | `pnpm install --frozen-lockfile` |
   | Build | `pnpm run build` |

4. Confirm env vars from Step 2.
5. **Deploy** / **Redeploy**.

Build log should look like:

```text
[build] DIRECT_URL not set — using DATABASE_URL...   # only if DIRECT_URL missing
[build] $ pnpm exec prisma migrate deploy
Applying migration `20260723000000_init`
[build] $ pnpm exec next build
✓ Compiled successfully
```

---

## Step 6 — (Optional) Seed production

Seeding is **not** automatic.

```bash
export DATABASE_URL="your-production-pooled-url"
export DIRECT_URL="your-production-direct-url"
pnpm run db:seed
```

| Email | Password | Role |
|-------|----------|------|

Or just use `/register` on the live site.

---

## Step 7 — (Optional) Custom domain

Vercel → **Settings → Domains** → add domain → create the DNS records shown → wait for SSL.

---

## Checklist

- [ ] Neon (or other) Postgres created  
- [ ] `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` set in Vercel for **Production + Build**  
- [ ] Repo has `pnpm-lock.yaml` (no `package-lock.json`)  
- [ ] Deploy log shows migrate applied, then Next compiled  
- [ ] You can open the URL and register / log in  

---

## Why the previous npm deploy looked stuck

Your log ended at:

```text
> prisma migrate deploy && next build
```

Typical causes:

1. **`DATABASE_URL` / `DIRECT_URL` not set for the Build** → Prisma waits or fails connecting to nowhere.  
2. **Only npm audit noise** (“6 high severity vulnerabilities”) — that does **not** fail the install; migrate is the real risk.  
3. Using **npm** with an outdated lockfile / advisory tree.

This repo now:

- Uses **pnpm** + lockfile  
- Overrides vulnerable transitive `postcss` / `sharp` where Next pins old versions  
- Validates env **before** migrate and prints actionable errors  

---

## Troubleshooting

### `[build] ERROR: DATABASE_URL is missing`

Add `DATABASE_URL` in Vercel → enable for **Build** → Redeploy.

### `[build] ERROR: AUTH_SECRET is missing or shorter than 16 characters`

```bash
openssl rand -base64 32
```

Paste into Vercel as `AUTH_SECRET`.

### `P1001: Can't reach database server`

Wrong host/password, or you pasted a `localhost` URL into Vercel. Use Neon’s host. Confirm `?sslmode=require`.

### `P1002` / migrate timeout

Neon project may be asleep on free tier — retry the deploy. Prefer **direct** URL for `DIRECT_URL`.

### `pnpm: command not found` on Vercel

Ensure `pnpm-lock.yaml` and `"packageManager": "pnpm@9.15.9"` are committed. Vercel enables Corepack from that field.

### `ERR_PNPM_OUTDATED_LOCKFILE`

Run locally:

```bash
pnpm install
git add pnpm-lock.yaml package.json
git commit -m "Update pnpm lockfile"
git push
```

### Still on npm in the Vercel UI

Project → **Settings → General** → clear any custom Install Command that says `npm install`, or leave blank so `vercel.json` applies. Then redeploy.

### SQLite / `file:./dev.db`

Local-only. Production must use `postgresql://...`.

---

## Updating after first deploy

```bash
pnpm install          # after dependency changes
pnpm exec prisma migrate dev --name describe_change   # after schema changes
git add -A && git commit -m "..." && git push origin main
```

Vercel rebuilds on each push to `main`. `prisma migrate deploy` applies new migrations automatically.

---

## Quick reference

```bash
# local
pnpm install
pnpm dev
pnpm run build

# vercel env (minimum)
DATABASE_URL=...
DIRECT_URL=...
AUTH_SECRET=...
```
