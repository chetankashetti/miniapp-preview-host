import express from "express";
import bodyParser from "body-parser";
import http from "node:http";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import httpProxy from "http-proxy";

const PORT = process.env.PORT || 8080;
const ROOT = "/srv";
const BOILERPLATE = path.join(ROOT, "boilerplate");
const PREVIEWS_ROOT = path.join(ROOT, "previews");
const PNPM_STORE = process.env.PNPM_STORE_DIR || "/srv/.pnpm-store";
const AUTH_TOKEN = process.env.PREVIEW_AUTH_TOKEN || "";
const BASE_PORT = 4000;

const previews = new Map(); // id -> { port, proc, dir, lastHit }
const app = express();
const server = http.createServer(app);
const proxy = httpProxy.createProxyServer({ ws: true });

app.use(bodyParser.json({ limit: "50mb" }));

// Simple bearer auth (recommended)
app.use((req, res, next) => {
  if (!AUTH_TOKEN) return next();
  const h = req.headers["authorization"];
  if (h === `Bearer ${AUTH_TOKEN}`) return next();
  res.status(401).json({ error: "unauthorized" });
});

// Helpers
function sha(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("exit", (c) =>
      c === 0 ? res() : rej(new Error(`${cmd} ${args.join(" ")} -> ${c}`))
    );
  });
}
async function copyBoilerplate(dst) {
  await fs.mkdir(dst, { recursive: true });
  await run("sh", [
    "-lc",
    `tar -C ${BOILERPLATE} -cf - . --exclude=.git | tar -C ${dst} -xpf -`,
  ]);
}
async function writeFiles(dir, files) {
  if (!Array.isArray(files)) return;
  await Promise.all(
    files.map(async (f) => {
      const full = path.join(dir, f.path);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, f.content, "utf8");
    })
  );
}
async function needInstall(dir, incomingPkg, incomingLock) {
  try {
    const baseLock = await fs.readFile(
      path.join(BOILERPLATE, "pnpm-lock.yaml"),
      "utf8"
    );
    const projLock =
      incomingLock ??
      (await fs.readFile(path.join(dir, "pnpm-lock.yaml"), "utf8"));
    return sha(baseLock) !== sha(projLock) || !!incomingPkg;
  } catch {
    return true;
  }
}
function nextFreePort() {
  const used = new Set([...previews.values()].map((p) => p.port));
  for (let p = BASE_PORT; p < BASE_PORT + 2000; p++) if (!used.has(p)) return p;
  throw new Error("No free ports");
}
function startDev(dir, port) {
  const proc = spawn("pnpm", ["--dir", dir, "dev", "-p", String(port)], {
    env: { ...process.env, PORT: String(port) },
    stdio: "inherit",
  });
  proc.on("exit", () => {
    for (const [id, p] of previews.entries())
      if (p.proc === proc) previews.delete(id);
  });
  return proc;
}

// Create/patch preview
app.post("/previews", async (req, res) => {
  const { id, files } = req.body; // files: [{path, content}]
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    if (previews.has(id)) {
      const p = previews.get(id);
      await writeFiles(p.dir, files);
      p.lastHit = Date.now();
      return res.json({ url: `/p/${id}` });
    }
    const dir = path.join(PREVIEWS_ROOT, id);
    await copyBoilerplate(dir);
    await writeFiles(dir, files);

    const hasPkg = files?.some((f) => f.path === "package.json");
    const hasLock = files?.some((f) => f.path === "pnpm-lock.yaml");
    const doInstall = await needInstall(
      dir,
      hasPkg ? files.find((f) => f.path === "package.json").content : null,
      hasLock ? files.find((f) => f.path === "pnpm-lock.yaml").content : null
    );
    if (doInstall) {
      await run("pnpm", [
        "--dir",
        dir,
        "install",
        "--prefer-offline",
        "--frozen-lockfile",
        "--store-dir",
        PNPM_STORE,
      ]);
    }

    const port = nextFreePort();
    const proc = startDev(dir, port);
    previews.set(id, { port, proc, dir, lastHit: Date.now() });

    res.json({ url: `/p/${id}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Stop preview
app.delete("/previews/:id", (req, res) => {
  const p = previews.get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  try {
    p.proc.kill("SIGTERM");
  } catch {}
  previews.delete(req.params.id);
  res.json({ ok: true });
});

// HTTP proxy for app + assets
app.use("/p/:id", (req, res) => {
  const p = previews.get(req.params.id);
  if (!p) return res.status(404).send("Preview not found");
  req.url = req.url.replace(`/p/${req.params.id}`, "") || "/";
  p.lastHit = Date.now();
  proxy.web(req, res, {
    target: `http://127.0.0.1:${p.port}`,
    changeOrigin: true,
  });
});

// WebSocket proxy (HMR)
server.on("upgrade", (req, socket, head) => {
  const m = req.url.match(/^\/p\/([^/]+)/);
  if (!m) return socket.destroy();
  const p = previews.get(m[1]);
  if (!p) return socket.destroy();
  proxy.ws(req, socket, head, { target: `ws://127.0.0.1:${p.port}` });
});

// Idle reaper
setInterval(() => {
  const now = Date.now();
  for (const [id, p] of previews.entries()) {
    if (now - p.lastHit > 30 * 60 * 1000) {
      // 30m
      try {
        p.proc.kill("SIGTERM");
      } catch {}
      previews.delete(id);
    }
  }
}, 60 * 1000);

server.listen(PORT, async () => {
  await fs.mkdir(PREVIEWS_ROOT, { recursive: true });
  console.log(`Preview host listening on ${PORT}`);
});
