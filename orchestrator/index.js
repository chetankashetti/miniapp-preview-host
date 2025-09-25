// orchestrator/index.js — full file

import express from "express";
import bodyParser from "body-parser";
import http from "node:http";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import httpProxy from "http-proxy"; // CJS default import

/* ========= Config ========= */

const PORT = process.env.PORT || 8080;

// Paths (env-overridable)
const BOILERPLATE = process.env.BOILERPLATE_DIR || "/srv/boilerplate";
const PREVIEWS_ROOT = process.env.PREVIEWS_ROOT || "/srv/previews";
const PNPM_STORE =
  process.env.PNPM_STORE_DIR || path.join(PREVIEWS_ROOT, ".pnpm-store");

// Auth (Bearer) for management endpoints only
const AUTH_TOKEN = process.env.PREVIEW_AUTH_TOKEN || "";

// Dev port base
const BASE_PORT = Number(process.env.BASE_PORT || 4000);

/* ========= Small utils ========= */

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
function sha(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function makeRing(cap = 4000) {
  const buf = [];
  return {
    push: (s) => {
      buf.push(s);
      if (buf.length > cap) buf.shift();
    },
    text: () => buf.join(""),
  };
}

/* ========= Process runner (logs to Railway + ring buffer) ========= */

function run(cmd, args, { id, cwd, env, logs } = {}) {
  return new Promise((resolve, reject) => {
    const label = id ? `[${id}]` : "";
    console.log(`${label} > ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onData = (d) => {
      const line = `${label} ${d.toString()}`;
      process.stdout.write(line);
      logs?.push(line);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else {
        const msg = `${cmd} exited ${code}`;
        console.error(`${label} ${msg}`);
        logs?.push(`${label} ${msg}\n`);
        reject(new Error(msg));
      }
    });
  });
}

/* ========= NPM install (robust) ========= */

async function npmInstall(dir, { id, storeDir, logs }) {
  const startTime = Date.now();
  console.log(`[${id}] Starting npm install...`);
  
  await fs.mkdir(storeDir, { recursive: true });

  const env = {
    ...process.env,
    NODE_ENV: "development", // include devDependencies (Next)
    CI: "1", // non-interactive
  };

  const baseArgs = [
    "install",
    "--prefer-offline",
  ];

  try {
    console.log(`[${id}] Running npm install with --prefer-offline...`);
    await run("npm", baseArgs, { id, cwd: dir, env, logs });
    console.log(`[${id}] npm install completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.log(`[${id}] npm install with --prefer-offline failed, retrying without...`);
    // fallback without --prefer-offline
    const retry = baseArgs.filter((a) => a !== "--prefer-offline");
    await run("npm", retry, { id, cwd: dir, env, logs });
    console.log(`[${id}] npm install retry completed in ${Date.now() - startTime}ms`);
  }

  // Verify Next binary exists
  const nextBin = path.join(dir, "node_modules", ".bin", "next");
  if (!(await exists(nextBin))) {
    throw new Error(`[${id}] install finished but ".bin/next" is missing`);
  }
}

async function needInstall(dir) {
  const nextBin = path.join(dir, "node_modules", ".bin", "next");
  return !(await exists(nextBin)); // install if Next is missing
}

/* ========= Preview registry & helpers ========= */

const previews = new Map(); // id -> { port, proc, dir, lastHit, status, logs, lastError }
const proxy = httpProxy.createProxyServer({ ws: true });

// prevent crashes on target errors
proxy.on("error", (err, req, res) => {
  console.error("proxy error:", err?.message || err);
  if (res && !res.headersSent) {
    res.writeHead(502, { "content-type": "text/plain" });
    return res.end(
      "Preview backend isn’t reachable yet. Try again in a few seconds."
    );
  }
  try {
    req?.socket?.destroy?.();
  } catch {}
});

let lastPort = BASE_PORT - 1;
function nextFreePort() {
  // simple rolling allocator across a 2k window
  for (let i = 0; i < 2000; i++) {
    const cand = ((lastPort + 1 - BASE_PORT + i) % 2000) + BASE_PORT;
    if (![...previews.values()].some((p) => p.port === cand)) {
      lastPort = cand;
      return cand;
    }
  }
  throw new Error("No free ports available");
}

async function copyBoilerplate(dst) {
  const startTime = Date.now();
  console.log(`[copyBoilerplate] Starting boilerplate copy to ${dst}...`);
  
  await fs.mkdir(dst, { recursive: true });
  // copy while excluding build dirs & node_modules
  await run("sh", [
    "-lc",
    `tar -C ${BOILERPLATE} -cf - . \
      --exclude=.git --exclude=node_modules --exclude=.next --exclude=.turbo --exclude=dist --exclude=build \
      | tar -C ${dst} -xpf -`,
  ]);
  // safety: ensure none of these exist post-copy
  for (const d of ["node_modules", ".next", ".turbo", "dist", "build"]) {
    await fs.rm(path.join(dst, d), { recursive: true, force: true });
  }
  
  console.log(`[copyBoilerplate] Boilerplate copy completed in ${Date.now() - startTime}ms`);
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

function startDev(id, dir, port, logs) {
  const startTime = Date.now();
  console.log(`[${id}] Starting Next.js dev server on port ${port}...`);
  
  const env = {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(port),
    ASSET_PREFIX: `/p/${id}`,
  };

  // Use npx to call next dev directly
  const proc = spawn(
    "npx",
    ["next", "dev", "-p", String(port), "-H", "127.0.0.1"],
    { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] }
  );

  const onData = (d) => {
    const line = `[${id}] ${d.toString()}`;
    process.stdout.write(line);
    logs?.push(line);
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);

  proc.on("exit", (code, signal) => {
    const p = previews.get(id);
    if (!p) return;
    p.status = "crashed";
    p.lastError = `dev exited code=${code} signal=${signal}`;
    previews.delete(id);
  });

  return proc;
}

function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) return next();
  const hdr = req.headers["authorization"] || "";
  if (hdr === `Bearer ${AUTH_TOKEN}`) return next();
  res.status(401).json({ error: "unauthorized" });
}

function waitForReady(port, timeoutMs = 1000000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tryOnce = () => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/", timeout: 1500 },
        (res) => {
          res.resume();
          resolve(true);
        }
      );
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(tryOnce, 300);
      });
      req.on("timeout", () => {
        try {
          req.destroy(new Error("timeout"));
        } catch {}
      });
    };
    tryOnce();
  });
}

/* ========= App & routes ========= */

const app = express();
const server = http.createServer(app);

app.use(bodyParser.json({ limit: "50mb" }));

// Deploy endpoint (compatibility with minidev app)
app.post("/deploy", requireAuth, async (req, res) => {
  const deployStartTime = Date.now();
  const projectId = req.body.hash;
  const files = req.body.files;
  const wait = req.body.wait ?? true; // default: wait for readiness
  if (!projectId) return res.status(400).json({ error: "hash required" });

  console.log(`[${projectId}] Starting deploy process...`);
  
  try {
    // Convert files object to array format expected by /previews
    const filesArray = Object.entries(files || {}).map(([path, content]) => ({
      path,
      content
    }));

    // If running, patch files and return
    if (previews.has(projectId)) {
      const running = previews.get(projectId);
      await writeFiles(running.dir, filesArray);
      running.lastHit = Date.now();
      return res.json({
        previewUrl: `localhost:${PORT}/p/${projectId}`,
        vercelUrl: `localhost:${PORT}/p/${projectId}`,
        aliasSuccess: true,
        isNewDeployment: false,
        hasPackageChanges: false,
        status: running.status || "running",
        port: running.port,
      });
    }

    const dir = path.join(PREVIEWS_ROOT, projectId);

    // Clean slate (avoid stale node_modules prompts)
    if (existsSync(dir)) {
      console.log(`[${projectId}] Cleaning existing directory...`);
      await fs.rm(dir, { recursive: true, force: true });
    }

    // Fresh: copy boilerplate, write deltas
    console.log(`[${projectId}] Setting up fresh preview...`);
    await copyBoilerplate(dir);
    await writeFiles(dir, filesArray);

    // Install (always on fresh create)
    const logs = makeRing();
    await npmInstall(dir, { id: projectId, storeDir: PNPM_STORE, logs });

    // Start dev (record BEFORE spawn to avoid races)
    const port = nextFreePort();
    const rec = {
      port,
      proc: null,
      dir,
      lastHit: Date.now(),
      status: "starting",
      logs,
      lastError: null,
    };
    previews.set(projectId, rec);
    const proc = startDev(projectId, dir, port, logs);
    rec.proc = proc;

    if (wait) {
      console.log(`[${projectId}] Waiting for dev server to be ready...`);
      const waitStartTime = Date.now();
      const ok = await waitForReady(port, 1000000);
      console.log(`[${projectId}] Dev server ready check took ${Date.now() - waitStartTime}ms`);
      
      if (!ok) {
        previews.delete(projectId);
        return res.status(500).json({
          error: "dev did not become ready in time",
          status: "starting",
          logs: logs.text().slice(-4000),
        });
      }
      rec.status = "running";
      console.log(`[${projectId}] Deploy completed successfully in ${Date.now() - deployStartTime}ms`);
      return res.json({ 
        previewUrl: `localhost:${PORT}/p/${projectId}`,
        vercelUrl: `localhost:${PORT}/p/${projectId}`,
        aliasSuccess: true,
        isNewDeployment: true,
        hasPackageChanges: true,
        status: "running", 
        port 
      });
    }

    console.log(`[${projectId}] Deploy completed (no wait) in ${Date.now() - deployStartTime}ms`);
    return res.json({ 
      previewUrl: `localhost:${PORT}/p/${projectId}`,
      vercelUrl: `localhost:${PORT}/p/${projectId}`,
      aliasSuccess: true,
      isNewDeployment: true,
      hasPackageChanges: true,
      status: "starting", 
      port 
    });
  } catch (e) {
    console.error(`[${projectId}] Deploy failed after ${Date.now() - deployStartTime}ms:`, e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

// Create/patch preview
app.post("/previews", requireAuth, async (req, res) => {
  const id = req.body.id;
  const files = req.body.files;
  const wait = req.body.wait ?? true; // default: wait for readiness
  if (!id) return res.status(400).json({ error: "id required" });

  try {
    // If running, patch files and return
    if (previews.has(id)) {
      const running = previews.get(id);
      await writeFiles(running.dir, files);
      running.lastHit = Date.now();
      return res.json({
        url: `/p/${id}`,
        status: running.status || "running",
        port: running.port,
      });
    }

    const dir = path.join(PREVIEWS_ROOT, id);

    // Clean slate (avoid stale node_modules prompts)
    if (existsSync(dir)) await fs.rm(dir, { recursive: true, force: true });

    // Fresh: copy boilerplate, write deltas
    await copyBoilerplate(dir);
    await writeFiles(dir, files);

    // Install (always on fresh create)
    const logs = makeRing();
    await npmInstall(dir, { id, storeDir: PNPM_STORE, logs });

    // Start dev (record BEFORE spawn to avoid races)
    const port = nextFreePort();
    const rec = {
      port,
      proc: null,
      dir,
      lastHit: Date.now(),
      status: "starting",
      logs,
      lastError: null,
    };
    previews.set(id, rec);
    const proc = startDev(id, dir, port, logs);
    rec.proc = proc;

    if (wait) {
      const ok = await waitForReady(port, 1000000);
      if (!ok) {
        previews.delete(id);
        return res.status(500).json({
          error: "dev did not become ready in time",
          status: "starting",
          logs: logs.text().slice(-4000),
        });
      }
      rec.status = "running";
      return res.json({ url: `/p/${id}`, status: "running", port });
    }

    return res.json({ url: `/p/${id}`, status: "starting", port });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

// Stop & delete preview (kills process + wipes folder)
app.delete("/previews/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  const p = previews.get(id);
  if (p) {
    try {
      p.proc.kill("SIGTERM");
    } catch {}
    previews.delete(id);
  }
  await fs.rm(path.join(PREVIEWS_ROOT, id), { recursive: true, force: true });
  res.json({ ok: true });
});

// Status & logs (for debugging)
app.get("/previews/:id/status", (req, res) => {
  const p = previews.get(req.params.id);
  if (!p) return res.status(404).json({ status: "not_found" });
  res.json({
    status: p.status || "unknown",
    port: p.port,
    dir: p.dir,
    lastError: p.lastError || null,
  });
});

app.get("/previews/:id/logs", (req, res) => {
  const p = previews.get(req.params.id);
  if (!p) return res.status(404).send("not_found");
  res.type("text/plain").send(p.logs?.text?.() || "");
});

// Proxy preview content (NO AUTH) + auto-restart if folder exists
app.use("/p/:id", async (req, res) => {
  const id = req.params.id;
  let p = previews.get(id);

  if (!p) {
    const dir = path.join(PREVIEWS_ROOT, id);
    if (existsSync(dir)) {
      const logs = makeRing();

      // ensure deps (safe if already present)
      if (await needInstall(dir)) {
        try {
          await npmInstall(dir, { id, storeDir: PNPM_STORE, logs });
        } catch (e) {
          return res
            .status(500)
            .send(`Auto-install failed: ${String(e.message || e)}`);
        }
      }

      const port = nextFreePort();
      p = {
        port,
        proc: null,
        dir,
        lastHit: Date.now(),
        status: "starting",
        logs,
        lastError: null,
      };
      previews.set(id, p);
      const proc = startDev(id, dir, port, logs);
      p.proc = proc;

      const ok = await waitForReady(port, 60000);
      if (!ok) {
        previews.delete(id);
        return res
          .status(503)
          .send("Preview is starting. Please retry in a few seconds.");
      }
      p.status = "running";
      console.log(`[${id}] auto-restarted on ${port}`);
    }
  }

  if (!p) return res.status(404).send("Preview not found");

  // Strip /p/:id before proxying to Next
  req.url = req.url.replace(`/p/${id}`, "") || "/";
  p.lastHit = Date.now();
  proxy.web(req, res, {
    target: `http://127.0.0.1:${p.port}`,
    changeOrigin: true,
  });
});

// WebSocket (HMR) pass-through (NO AUTH)
server.on("upgrade", (req, socket, head) => {
  const m = req.url.match(/^\/p\/([^/]+)/);
  if (!m) return socket.destroy();
  const id = m[1];
  const p = previews.get(id);
  if (!p) return socket.destroy();
  proxy.ws(req, socket, head, { target: `ws://127.0.0.1:${p.port}` });
});

// Command execution endpoint for AI context gathering
app.post("/previews/:id/execute", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { command, args, workingDirectory = "." } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: "Command is required" });
  }

  // Security: Only allow whitelisted commands
  const allowedCommands = [
    "grep", "find", "tree", "cat", "head", "tail", "wc", "ls", "pwd",
    "file", "which", "type", "dirname", "basename", "realpath"
  ];

  if (!allowedCommands.includes(command)) {
    return res.status(400).json({ 
      error: `Command '${command}' is not allowed`,
      allowedCommands 
    });
  }

  // Security: Limit arguments
  if (args && args.length > 10) {
    return res.status(400).json({ error: "Too many arguments" });
  }

  // Security: Check for dangerous patterns
  const dangerousPatterns = [
    /[;&|`$]/,           // Command chaining
    /\.\./,              // Directory traversal
    /\/etc\/|\/proc\/|\/sys\//, // System directories
    /rm\s|del\s|mv\s|cp\s/,     // File operations
    /wget|curl|nc\s|netcat/,    // Network operations
    /eval|exec|system/,         // Code execution
  ];

  const allArgs = args || [];
  for (const arg of allArgs) {
    if (dangerousPatterns.some(pattern => pattern.test(arg))) {
      return res.status(400).json({ 
        error: `Dangerous pattern detected in argument: ${arg}` 
      });
    }
  }

  try {
    const p = previews.get(id);
    if (!p) {
      return res.status(404).json({ error: "Preview not found" });
    }

    const projectDir = p.dir;
    const fullWorkingDir = path.join(projectDir, workingDirectory);
    
    // Security: Ensure working directory is within project
    if (!fullWorkingDir.startsWith(projectDir)) {
      return res.status(400).json({ error: "Working directory outside project bounds" });
    }

    if (!existsSync(fullWorkingDir)) {
      return res.status(400).json({ error: "Working directory does not exist" });
    }

    console.log(`[${id}] Executing command: ${command} ${allArgs.join(" ")}`);
    
    const startTime = Date.now();
    const result = await run(command, allArgs, { 
      id, 
      cwd: fullWorkingDir,
      env: { ...process.env, NODE_ENV: "development" }
    });
    const executionTime = Date.now() - startTime;

    console.log(`[${id}] Command completed in ${executionTime}ms`);

    res.json({
      success: true,
      command,
      args: allArgs,
      workingDirectory,
      executionTime,
      output: result
    });

  } catch (error) {
    console.error(`[${id}] Command execution failed:`, error);
    res.status(500).json({
      success: false,
      error: error.message || "Command execution failed",
      command,
      args: allArgs
    });
  }
});

/* ========= Idle reaper (optional; 30 min) ========= */

setInterval(() => {
  const now = Date.now();
  for (const [id, p] of previews.entries()) {
    if (now - p.lastHit > 30 * 60 * 1000) {
      try {
        p.proc.kill("SIGTERM");
      } catch {}
      previews.delete(id);
      console.log(`[${id}] reaped (idle)`);
    }
  }
}, 60 * 1000);

/* ========= Boot ========= */

const appStart = async () => {
  await fs.mkdir(PREVIEWS_ROOT, { recursive: true });
  await fs.mkdir(PNPM_STORE, { recursive: true });
  console.log(`Preview host starting on ${PORT}`);
  server.listen(PORT, () => console.log(`Listening on ${PORT}`));
};

appStart().catch((e) => {
  console.error("Fatal boot error:", e);
  process.exit(1);
});
