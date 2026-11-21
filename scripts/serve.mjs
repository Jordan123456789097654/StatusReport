#!/usr/bin/env node
// One command to run StatusReport on a single machine (e.g. a laptop):
//   npm run build && npm run serve
// Starts the production web server and the check worker, restarts either if it crashes,
// and shuts both down cleanly on Ctrl+C.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || "3000";
const nodeArgs = ["--env-file-if-exists=.env"];

const services = [
  { name: "web", args: [...nodeArgs, path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", port] },
  { name: "worker", args: [...nodeArgs, "--import", "tsx", path.join("worker", "index.ts")] },
];

let stopping = false;
const children = new Map();

function start(svc, attempt = 0) {
  const child = spawn(process.execPath, svc.args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: process.env });
  children.set(svc.name, child);
  const prefix = (stream, out) =>
    stream.on("data", (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => out.write(`[${svc.name}] ${l}\n`)));
  prefix(child.stdout, process.stdout);
  prefix(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (stopping) return;
    const delay = Math.min(30_000, 2_000 * 2 ** attempt);
    console.error(`[serve] ${svc.name} exited (code ${code}); restarting in ${delay / 1000}s`);
    setTimeout(() => start(svc, attempt + 1), delay);
  });
  // A process that stays up for a minute is considered healthy: reset the backoff.
  setTimeout(() => {
    if (children.get(svc.name) === child && child.exitCode === null) attempt = 0;
  }, 60_000);
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("[serve] shutting down…");
  for (const c of children.values()) c.kill();
  setTimeout(() => process.exit(0), 1500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[serve] starting web on :${port} and the worker`);
services.forEach((s) => start(s));
