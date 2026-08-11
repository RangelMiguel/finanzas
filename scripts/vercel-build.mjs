#!/usr/bin/env node
/**
 * Production build for Vercel / CI (pnpm).
 * - Validates required env vars early (clear errors instead of Prisma hang)
 * - Rewrites Neon/PgBouncer pooler hosts so migrate uses a direct session
 *   (advisory locks time out on transaction poolers → P1002)
 * - Retries migrate deploy (Neon cold start + overlapping Vercel builds)
 * - Then next build
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Prefer project local binaries (works under pnpm + Vercel)
const binDir = path.join(root, "node_modules", ".bin");
process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH || ""}`;

function fail(msg) {
  console.error(`\n[build] ERROR: ${msg}\n`);
  process.exit(1);
}

function sleep(ms) {
  spawnSync("sleep", [String(Math.max(1, Math.ceil(ms / 1000)))], {
    stdio: "ignore",
  });
}

/** Add query params if missing (does not override existing). */
function withSearchParams(raw, extras) {
  try {
    const u = new URL(raw);
    for (const [key, value] of Object.entries(extras)) {
      if (!u.searchParams.has(key)) u.searchParams.set(key, value);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * Prisma migrate uses pg_advisory_lock(), which needs a session-level
 * connection. Neon/Supabase pooler hosts and pgbouncer=true break that.
 */
function toDirectPostgresUrl(raw) {
  try {
    const u = new URL(raw);
    const before = u.hostname;
    if (u.hostname.includes("-pooler.")) {
      u.hostname = u.hostname.replace("-pooler.", ".");
    }
    u.searchParams.delete("pgbouncer");
    if (u.hostname !== before) {
      console.warn(
        `[build] Rewrote pooled host ${before} → ${u.hostname} for DIRECT_URL (migrations need a direct session).`
      );
    }
    if (u.hostname.includes("pooler.supabase.com")) {
      console.warn(
        "[build] DIRECT_URL still looks like the Supabase pooler. Set DIRECT_URL to db.<ref>.supabase.co:5432."
      );
    }
    return u.toString();
  } catch {
    return raw;
  }
}

const databaseUrl = (process.env.DATABASE_URL || "").trim();
const authSecret = (process.env.AUTH_SECRET || "").trim();
let directUrl = (process.env.DIRECT_URL || "").trim();

if (!databaseUrl) {
  fail(
    "DATABASE_URL is missing. In Vercel → Settings → Environment Variables, set a PostgreSQL URL (Neon pooled or direct) for Production and enable it for Builds."
  );
}

if (databaseUrl.startsWith("file:")) {
  fail(
    "DATABASE_URL points at a SQLite file. Vercel requires PostgreSQL (e.g. Neon). See push.md."
  );
}

if (!directUrl) {
  console.warn(
    "[build] DIRECT_URL not set — deriving a direct URL from DATABASE_URL."
  );
  directUrl = databaseUrl;
}

directUrl = toDirectPostgresUrl(directUrl);
directUrl = withSearchParams(directUrl, {
  sslmode: "require",
  connect_timeout: "20",
});
process.env.DIRECT_URL = directUrl;

// Keep the app on the (possibly pooled) DATABASE_URL, but give Neon time to wake.
process.env.DATABASE_URL = withSearchParams(databaseUrl, {
  connect_timeout: "15",
  pool_timeout: "15",
});

if (!authSecret || authSecret.length < 16) {
  fail(
    "AUTH_SECRET is missing or shorter than 16 characters. Set a strong secret (openssl rand -base64 32) in Vercel env vars."
  );
}

function run(command, args) {
  console.log(`\n[build] $ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    cwd: root,
    shell: process.platform === "win32",
  });
  if (result.error) {
    fail(`${command} failed to start: ${result.error.message}`);
  }
  return result.status ?? 1;
}

const migrateAttempts = 5;
for (let attempt = 1; attempt <= migrateAttempts; attempt++) {
  const status = run("prisma", ["migrate", "deploy"]);
  if (status === 0) break;
  if (attempt === migrateAttempts) {
    fail(
      "prisma migrate deploy failed after retries (P1002 is usually a pooled DIRECT_URL or a leftover advisory lock).\n" +
        "  • Set DIRECT_URL to the Neon *direct* string (host without “-pooler”).\n" +
        "  • Cancel overlapping Vercel deploys so two builds are not migrating at once.\n" +
        "  • In Neon SQL: SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query ILIKE '%pg_advisory_lock%';"
    );
  }
  const waitSec = 4 * attempt;
  console.warn(
    `[build] migrate deploy failed (attempt ${attempt}/${migrateAttempts}). Retrying in ${waitSec}s — Neon wake-up or another deploy holding the migrate lock.`
  );
  sleep(waitSec * 1000);
}

const nextStatus = run("next", ["build"]);
if (nextStatus !== 0) process.exit(nextStatus);

console.log("\n[build] Done.\n");
