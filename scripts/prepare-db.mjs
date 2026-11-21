#!/usr/bin/env node
// Rewrites the datasource block of prisma/schema.prisma to match DATABASE_URL:
//   • postgres(ql):// → provider "postgresql" (+ directUrl when DIRECT_URL is set, as Neon needs for migrations)
//   • anything else   → provider "sqlite" (zero-config self-hosting)
// Run automatically by `npm run build`, `npm run db:push` and `npm run setup`.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "prisma", "schema.prisma");

function loadDotEnv() {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

const url = process.env.DATABASE_URL || "file:../data/statusreport.db";
const provider = /^postgres(ql)?:\/\//i.test(url) ? "postgresql" : "sqlite";
const directUrl = provider === "postgresql" && process.env.DIRECT_URL;

const block = [
  "datasource db {",
  `  provider  = "${provider}"`,
  '  url       = env("DATABASE_URL")',
  ...(directUrl ? ['  directUrl = env("DIRECT_URL")'] : []),
  "}",
].join("\n");

const schema = readFileSync(schemaPath, "utf8");
const re = /datasource db \{[^}]*\}/;
if (!re.test(schema)) throw new Error("datasource block not found in prisma/schema.prisma");
const next = schema.replace(re, block);
if (next !== schema) writeFileSync(schemaPath, next);
console.log(`[prepare-db] provider=${provider}${directUrl ? " (directUrl)" : ""}${next !== schema ? " (schema updated)" : ""}`);

if (provider === "sqlite") mkdirSync(path.join(root, "data"), { recursive: true });
