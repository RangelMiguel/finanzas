#!/usr/bin/env node
/**
 * Production build for Vercel / CI (pnpm).
 * - Validates required env vars early (clear errors instead of Prisma hang)
 * - Defaults DIRECT_URL → DATABASE_URL when only one Postgres URL is set
 * - Runs prisma migrate deploy, then next build
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
    "[build] DIRECT_URL not set — using DATABASE_URL for migrations. For Neon, prefer the non-pooled (direct) connection as DIRECT_URL."
  );
  process.env.DIRECT_URL = databaseUrl;
  directUrl = databaseUrl;
}

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
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("prisma", ["migrate", "deploy"]);
run("next", ["build"]);

console.log("\n[build] Done.\n");
