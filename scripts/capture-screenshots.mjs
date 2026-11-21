#!/usr/bin/env node
// Captures REAL screenshots of the running app (light + dark) into public/screenshots.
// Needs: the app running against the demo database (see scripts/screenshots.ps1 / README), and Chrome or Edge installed.
//   BASE_URL=http://localhost:3200 DATABASE_URL=file:../data/demo.db node scripts/capture-screenshots.mjs
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "screenshots");
mkdirSync(out, { recursive: true });

const BASE = process.env.BASE_URL || "http://localhost:3200";
const EMAIL = "demo@northwind.test";
const PASSWORD = process.env.DEMO_PASSWORD || "demo-screenshots-only";
const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error("Chrome or Edge not found. Set CHROME_PATH.");

// SPAWN_SERVER=1: start (and later stop) a temporary production server for the capture.
let server;
if (process.env.SPAWN_SERVER === "1") {
  const port = new URL(BASE).port || "3200";
  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", port], { cwd: root, env: process.env, stdio: "ignore" });
  process.on("exit", () => server?.kill());
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/login`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const db = new PrismaClient();
const apiMon = await db.monitor.findFirstOrThrow({ where: { name: "API" } });
const incident = await db.incident.findFirstOrThrow({ where: { number: 14 } });
const page = await db.statusPage.findFirstOrThrow({ where: { slug: "northwind" } });
const channel = await db.alertChannel.findFirstOrThrow({ where: { type: "discord", visibility: "public" } });

const SHOTS = [
  { name: "monitors", url: "/dashboard/monitors" },
  { name: "monitor-detail", url: `/dashboard/monitors/${apiMon.id}` },
  { name: "incident", url: `/dashboard/incidents/${incident.id}` },
  { name: "status-page", url: "/s/northwind" },
  { name: "builder", url: `/dashboard/status-pages/${page.id}?tab=design` },
  { name: "discord", url: `/dashboard/integrations/${channel.id}` },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] });

for (const theme of ["light", "dark"]) {
  // The public status page has its own theme setting; keep it in step with the screenshot theme.
  await db.statusPage.update({ where: { id: page.id }, data: { theme: theme === "dark" ? "clean-dark" : "clean-light" } });
  await db.jobState.upsert({ where: { key: "worker:local" }, create: { key: "worker:local", lastRunAt: new Date() }, update: { lastRunAt: new Date() } });

  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.evaluateOnNewDocument((t) => localStorage.setItem("theme", t), theme);

  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await p.type('input[name="email"]', EMAIL);
  await p.type('input[name="password"]', PASSWORD);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle0" }), p.click('button[type="submit"], form button')]);

  for (const s of SHOTS) {
    await p.goto(`${BASE}${s.url}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1500)); // let entrance animations finish
    const file = path.join(out, `${s.name}-${theme}.webp`);
    await p.screenshot({ path: file, type: "webp", quality: 86 });
    console.log(`captured ${s.name}-${theme}`);
  }
  await ctx.close();
}

// Leave the demo page in its light theme.
await db.statusPage.update({ where: { id: page.id }, data: { theme: "clean-light" } });
await browser.close();
await db.$disconnect();
server?.kill();
console.log(`done: ${out}`);
