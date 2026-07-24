# MisFinanzas Familiar

Clone of [MisFinanzas Local Only](https://finanzaslocales.lovable.app/) with a **secure multi-user database**, **authentication**, and **household/family sharing**.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind
- **Prisma** + **PostgreSQL** (Neon, Vercel Postgres, Supabase, or local Postgres)
- **Auth**: email/password, JWT in **httpOnly** cookie (`jose` + `bcryptjs`)
- Server-side authorization by household membership + roles

## Quick start

Requires **Node.js 20+** and **pnpm 9** (`corepack enable && corepack prepare pnpm@9.15.9 --activate`).

```bash
cd misfinanzas-family
cp .env.example .env
# Edit .env: set DATABASE_URL, DIRECT_URL, and AUTH_SECRET
pnpm install
pnpm exec prisma migrate deploy
pnpm dev
```

Open http://localhost:3000

### Deploy to Vercel

See **[push.md](./push.md)** for a full step-by-step guide (Postgres → env vars → GitHub → Vercel).  
The project uses **pnpm** (`pnpm-lock.yaml` + `packageManager` field).

### Auth

Passkey-only. Use **Register** to create a household and enroll Face ID / fingerprint / security key. There is no password login.

## Features

- Login / register / logout
- Household + invites + roles (`owner` / `admin` / `member` / `viewer`)
- **i18n**: Spanish / English (per-user language preference)
- **Currency**: household currency (MXN, USD, EUR, …) with locale-aware formatting
- **Allowances (mesadas)**: per-member weekly/monthly spend caps, optional category scope, enforce on expense create
- Dashboard (with budget alerts), accounts, transfers, transactions, budgets
- Credit cards, MSI installment plans, recurring incomes
- Debts + capital/interest payments
- Safe-to-spend projection
- Catch-up assistant (“Ponerme al día”)
- Encrypted export/import (PBKDF2 + AES-GCM `.enc`)
- Banamex-style MSI text/PDF import
- Activity feed + `createdBy` / `spentBy` attribution
- Soft-delete transactions; household wipe (admin)

## Optional AI extraction (receipts & statements)

If an LLM key is configured, **Tickets** and **Estado de cuenta** use the model first and fall back to the rule-based parser on failure or empty results.

| Provider | Env vars | Default model |
|----------|----------|---------------|
| **Grok (xAI)** | `XAI_API_KEY` or `GROK_API_KEY` | `grok-4.5` |
| **Gemini** | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | `gemini-2.0-flash` |

```bash
# Grok (preferred when both set and LLM_PROVIDER=auto)
export XAI_API_KEY=xai-...

# or Gemini
export GEMINI_API_KEY=...

# optional
export LLM_PROVIDER=auto   # auto | grok | gemini
export LLM_MODEL=          # override model id
```

Keys stay **server-side** only (API routes). Without keys, OCR + regex parsers run as before.

Check status: `GET /api/ai/status` (authenticated).

## Security (summary)

- **Passkey-only auth** (WebAuthn — Face ID, Android biometrics, USB/NFC). No passwords.
- **Rate limits** on register / passkey login / wipe (Postgres-backed)
- **Monitoring**: in-app security alerts for every household member (bell icon + Security page). No external email.

## Production notes

1. Set a strong `AUTH_SECRET` (32+ chars) — e.g. `openssl rand -base64 32`
2. Use PostgreSQL: set `DATABASE_URL` (pooled OK) and `DIRECT_URL` (non-pooled, for migrations)
3. Build runs `prisma migrate deploy` then `next build` (Vercel-ready)
4. Serve over HTTPS; session cookies use `secure` in production
5. Never commit `.env` or local database files

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Dev server |
| `pnpm run build` | Env check + migrate + production build |
| `pnpm start` | Start production server |
| `pnpm run db:migrate` | Create/apply migrations (dev) |
| `pnpm run db:migrate:deploy` | Apply migrations (prod/CI) |
| `pnpm run db:push` | Push schema without migration files |
| `pnpm run db:seed` | Remove legacy demo users (if any) |
