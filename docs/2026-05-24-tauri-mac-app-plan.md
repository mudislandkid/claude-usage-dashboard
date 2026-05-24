# Tauri Mac App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing claude-usage-dashboard webapp as a signed, notarized macOS application for Apple Silicon, distributed as a DMG via GitHub releases with in-app auto-updates.

**Architecture:** Tauri (Rust shell + macOS WKWebView) wraps the existing React frontend. The Node + Fastify backend is bundled as a Tauri sidecar — Tauri's Rust shell spawns the Node binary on launch, reads `READY <port>` from stdout, then points the webview at `http://127.0.0.1:<port>/` where Fastify serves both the React build and the existing `/api/*` routes. No backend logic changes; the webview using the same origin as the API server means relative URLs continue to work unchanged.

**Tech Stack:** Tauri 2.x, Rust stable, Node 20 LTS (bundled), existing Fastify/React/SQLite stack untouched, GitHub Actions on `macos-14` runners for signed release builds.

**Spec:** `docs/2026-05-24-tauri-mac-app-design.md`

---

## File Structure (locked decisions)

**New files / dirs:**

```
src-tauri/
├── Cargo.toml                      Rust dependency manifest
├── tauri.conf.json                 Tauri bundle config: identifier, sidecar list, signing, updater pubkey
├── build.rs                        Standard Tauri build script
├── entitlements.plist              Hardened-runtime entitlements for notarization
├── icons/
│   ├── 32x32.png
│   ├── 128x128.png
│   ├── 128x128@2x.png
│   ├── icon.png
│   └── icon.icns                   macOS icon set (placeholder for M1, final art before M3)
├── binaries/
│   └── .gitkeep                    Sidecar Node binary lives here at build time (gitignored)
└── src/
    ├── main.rs                     Tauri app entry: builder, plugins, setup, menu wiring
    ├── sidecar.rs                  Spawn Node sidecar, parse READY <port>, lifecycle (SIGTERM/SIGKILL on quit)
    └── menu.rs                     Native macOS menu bar definitions

scripts/
├── prepare-sidecar.mjs             Downloads Node 20 LTS arm64, places as src-tauri/binaries/cud-server-aarch64-apple-darwin
└── sign-native-addons.sh           Codesigns every .node addon under server/node_modules before bundling

.github/workflows/
├── release.yml                     Tag-triggered build → sign → notarize → release
└── ci.yml                          PR-triggered typecheck + test + unsigned smoke build
```

**Modified files:**

| File | Change |
|---|---|
| `package.json` (root) | Add `tauri:dev`, `tauri:build`, `prepare:sidecar` scripts. Add `@tauri-apps/cli` devDep. |
| `web/package.json` | Add `@tauri-apps/api` and `@tauri-apps/plugin-updater` deps. |
| `web/src/main.tsx` | On mount, if `window.__TAURI_INTERNALS__` is defined, register updater check. |
| `server/src/config.ts` | `PORT` defaults to `0` when `process.env.CUD_BUNDLED === '1'`. |
| `server/src/index.ts` | Print `READY <port>` after `app.listen()`. Register `@fastify/static` for built React when `CUD_BUNDLED=1`. |
| `.gitignore` | Add `src-tauri/target/`, `src-tauri/binaries/cud-server-*`, `*.dmg`. |
| `README.md` | New "Download for macOS" section with releases link. |

**Files explicitly NOT changed:**

- `web/src/lib/api.ts` — relative `/api` URLs already work because the webview loads from the same origin as the Fastify server. No `window.__CUD_PORT__` injection needed (deviation from spec §4 — simpler is better).
- All `server/src/scanner/`, `watcher/`, `api/`, `db/`, `lib/`, `git/`, `pricing.ts` — backend logic untouched.
- All `web/src/components/`, `hooks/`, `pages/` — UI untouched.

---

## Milestone M1 — Local Tauri build (unsigned)

**Outcome:** `npm run tauri:dev` opens the dashboard in a native Mac window with Vite HMR. `npm run tauri:build` produces a working (unsigned) `.app` and `.dmg` that runs end-to-end on the local machine.

---

### Task M1.1: Scaffold src-tauri/ with Cargo.toml and minimal main.rs

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/binaries/.gitkeep`

- [ ] **Step 1: Create `src-tauri/Cargo.toml`**

```toml
[package]
name = "claude-usage-dashboard"
version = "0.1.0"
description = "Claude Usage Dashboard"
authors = ["Greg Herriott"]
edition = "2021"

[lib]
name = "claude_usage_dashboard_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["macos-private-api"] }
tauri-plugin-shell = "2"
tauri-plugin-window-state = "2"
tauri-plugin-updater = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "io-util", "process", "time", "sync"] }
tracing = "0.1"
tracing-subscriber = "0.3"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

- [ ] **Step 2: Create `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 3: Create `src-tauri/src/main.rs` (minimal — empty window, no sidecar yet)**

```rust
// Prevents additional console window on Windows in release; harmless on macOS.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Create `src-tauri/binaries/.gitkeep` (empty file)**

```bash
touch src-tauri/binaries/.gitkeep
```

- [ ] **Step 5: Create `src-tauri/tauri.conf.json` (minimal — devUrl points at Vite, build uses dist/)**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Claude Usage Dashboard",
  "version": "0.1.0",
  "identifier": "com.lunawispdesigns.claude-usage-dashboard",
  "build": {
    "devUrl": "http://localhost:5173",
    "frontendDist": "../web/dist",
    "beforeDevCommand": "npm run dev -w web",
    "beforeBuildCommand": "npm run build -w web"
  },
  "app": {
    "windows": [
      {
        "title": "Claude Usage Dashboard",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns"
    ],
    "category": "DeveloperTool",
    "macOS": {
      "minimumSystemVersion": "12.0"
    }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/build.rs src-tauri/src/main.rs src-tauri/tauri.conf.json src-tauri/binaries/.gitkeep
git commit -m "feat(tauri): scaffold minimal Tauri Rust shell"
```

---

### Task M1.2: Add Tauri CLI and npm scripts

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Install @tauri-apps/cli at the root**

```bash
npm install --save-dev --workspace-root @tauri-apps/cli@^2
```

Expected: package added to root `devDependencies`, lockfile updated.

- [ ] **Step 2: Edit `package.json` scripts section to add Tauri commands**

Read the current `package.json`. Replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "concurrently -n server,web -c blue,magenta \"npm:dev -w server\" \"npm:dev -w web\"",
  "build": "npm run build -w server && npm run build -w web",
  "test": "npm run test -w server && npm run test -w web",
  "typecheck": "npm run typecheck -w server && npm run typecheck -w web",
  "prepare:sidecar": "node scripts/prepare-sidecar.mjs",
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "tauri:build": "npm run build && npm run prepare:sidecar && tauri build"
}
```

- [ ] **Step 3: Verify Tauri CLI runs**

Run: `npx tauri info`
Expected: prints Tauri version + environment summary, exits 0.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(tauri): add CLI dev/build scripts to root package.json"
```

---

### Task M1.3: Write prepare-sidecar.mjs to download Node 20 arm64

**Files:**
- Create: `scripts/prepare-sidecar.mjs`

- [ ] **Step 1: Create `scripts/prepare-sidecar.mjs`**

```javascript
#!/usr/bin/env node
// Downloads Node 20 LTS arm64-darwin, extracts bin/node, places at
// src-tauri/binaries/cud-server-aarch64-apple-darwin (Tauri sidecar naming).
// Idempotent: skips download if the binary is already present and reports its version.

import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NODE_VERSION = '20.18.1';
const NODE_TARBALL = `node-v${NODE_VERSION}-darwin-arm64.tar.gz`;
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}`;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const TARGET_DIR = join(REPO_ROOT, 'src-tauri', 'binaries');
const TARGET_BIN = join(TARGET_DIR, 'cud-server-aarch64-apple-darwin');

async function main() {
  if (existsSync(TARGET_BIN)) {
    const v = spawnSync(TARGET_BIN, ['--version'], { encoding: 'utf8' });
    if (v.status === 0 && v.stdout.trim() === `v${NODE_VERSION}`) {
      console.log(`[sidecar] Node ${NODE_VERSION} already in place at ${TARGET_BIN}`);
      return;
    }
    console.log(`[sidecar] Existing binary mismatch (${v.stdout.trim()}); replacing.`);
    await rm(TARGET_BIN);
  }

  mkdirSync(TARGET_DIR, { recursive: true });
  const tmp = await mkdtemp(join(tmpdir(), 'cud-sidecar-'));
  const tarPath = join(tmp, NODE_TARBALL);

  console.log(`[sidecar] Downloading ${NODE_URL}`);
  const res = await fetch(NODE_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  await writeFile(tarPath, Buffer.from(await res.arrayBuffer()));

  console.log(`[sidecar] Extracting bin/node`);
  const dirName = `node-v${NODE_VERSION}-darwin-arm64`;
  const extract = spawnSync(
    'tar',
    ['-xzf', tarPath, '-C', tmp, `${dirName}/bin/node`],
    { stdio: 'inherit' },
  );
  if (extract.status !== 0) throw new Error('tar extraction failed');

  const extractedBin = join(tmp, dirName, 'bin', 'node');
  spawnSync('cp', [extractedBin, TARGET_BIN], { stdio: 'inherit' });
  chmodSync(TARGET_BIN, 0o755);

  const verify = spawnSync(TARGET_BIN, ['--version'], { encoding: 'utf8' });
  if (verify.status !== 0 || verify.stdout.trim() !== `v${NODE_VERSION}`) {
    throw new Error(`Placed binary verification failed: ${verify.stdout} ${verify.stderr}`);
  }

  await rm(tmp, { recursive: true });
  console.log(`[sidecar] Ready: ${TARGET_BIN} (Node ${NODE_VERSION})`);
}

main().catch((e) => {
  console.error('[sidecar] FAILED:', e);
  process.exit(1);
});
```

- [ ] **Step 2: Run it and verify the sidecar binary appears**

Run: `node scripts/prepare-sidecar.mjs`
Expected output: `[sidecar] Ready: .../src-tauri/binaries/cud-server-aarch64-apple-darwin (Node 20.18.1)`

Then verify:
```bash
./src-tauri/binaries/cud-server-aarch64-apple-darwin --version
```
Expected: `v20.18.1`

- [ ] **Step 3: Run a second time to verify idempotency**

Run: `node scripts/prepare-sidecar.mjs`
Expected: `[sidecar] Node 20.18.1 already in place at ...` (no re-download).

- [ ] **Step 4: Commit (the script only — binary is gitignored later)**

```bash
git add scripts/prepare-sidecar.mjs
git commit -m "feat(tauri): script to fetch Node 20 sidecar binary"
```

---

### Task M1.4: Update .gitignore for Tauri artifacts

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append to `.gitignore`**

```
# Tauri build artifacts
src-tauri/target/
src-tauri/binaries/cud-server-*
src-tauri/gen/
*.dmg
*.app
```

- [ ] **Step 2: Verify the sidecar binary is now ignored**

Run: `git check-ignore -v src-tauri/binaries/cud-server-aarch64-apple-darwin`
Expected: a `.gitignore:<line>:src-tauri/binaries/cud-server-*` match line, exit 0.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore(tauri): gitignore build artifacts and sidecar binary"
```

---

### Task M1.5: Server — port=0 when bundled (TDD)

**Files:**
- Modify: `server/src/config.ts`
- Test: `server/src/config.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `server/src/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('PORT default', () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.PORT;
    delete process.env.CUD_BUNDLED;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults to 8790 in normal mode', async () => {
    const m = await import(`./config.js?cachebust=${Math.random()}`);
    expect(m.PORT).toBe(8790);
  });

  it('defaults to 0 (OS-assigned) when CUD_BUNDLED=1', async () => {
    process.env.CUD_BUNDLED = '1';
    const m = await import(`./config.js?cachebust=${Math.random()}`);
    expect(m.PORT).toBe(0);
  });

  it('honors explicit PORT even when bundled', async () => {
    process.env.CUD_BUNDLED = '1';
    process.env.PORT = '9999';
    const m = await import(`./config.js?cachebust=${Math.random()}`);
    expect(m.PORT).toBe(9999);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test -w server -- config.test`
Expected: `defaults to 0 (OS-assigned) when CUD_BUNDLED=1` FAILs (current code returns 8790).

- [ ] **Step 3: Modify `server/src/config.ts`**

Replace the `PORT` line with:

```typescript
const DEFAULT_PORT = process.env.CUD_BUNDLED === '1' ? 0 : 8790;
export const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm run test -w server -- config.test`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/config.ts server/src/config.test.ts
git commit -m "feat(server): default PORT=0 when CUD_BUNDLED=1"
```

---

### Task M1.6: Server — install @fastify/static and print READY <port>

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/package.json` (verify @fastify/static is in deps — it already is per `package.json`)

- [ ] **Step 1: Confirm `@fastify/static` is present**

Run: `node -e "console.log(require('./server/package.json').dependencies['@fastify/static'])"`
Expected: prints `^7.0.4` (or similar). If missing, run `npm install @fastify/static@^7 -w server`.

- [ ] **Step 2: Modify `server/src/index.ts` — add static serving + READY print**

Replace the file contents with:

```typescript
import { openDb } from './db/connection.js';
import { buildApi } from './api/server.js';
import { scanAll } from './scanner/scanner.js';
import { createWatcher } from './watcher/watcher.js';
import { DB_PATH, PROJECTS_DIR, PORT, HOST } from './config.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';

const BUNDLED = process.env.CUD_BUNDLED === '1';

async function main() {
  const db = openDb(DB_PATH);
  console.log(`[boot] DB at ${DB_PATH}`);
  console.log(`[boot] Initial scan of ${PROJECTS_DIR}…`);
  const r = await scanAll(db, PROJECTS_DIR);
  console.log(
    `[boot] Scanned ${r.filesScanned} files (+${r.turnsInserted} turns, ${r.filesSkipped} skipped, ${r.errors} errors)`,
  );

  const watcher = createWatcher(db, PROJECTS_DIR);
  watcher.start();

  const app = await buildApi({
    db,
    triggerScan: async () => {
      await scanAll(db, PROJECTS_DIR);
    },
  });

  if (BUNDLED) {
    // Resolve the React build relative to this file. Two layouts we handle:
    //   1. Bundled: Resources/server/index.js -> Resources/dist (sibling)
    //   2. Local build: server/dist/index.js -> repo-root/web/dist
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(here, '..', 'dist'),
      path.resolve(here, '..', '..', 'web', 'dist'),
    ];
    const webRoot = candidates.find((p) => existsSync(p));
    if (!webRoot) {
      console.error(`[boot] CUD_BUNDLED=1 but web build not found. Tried: ${candidates.join(', ')}`);
      process.exit(1);
    }
    await app.register(fastifyStatic, { root: webRoot, prefix: '/', wildcard: false });
    // SPA fallback so deep links resolve to index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
    console.log(`[boot] Serving static web from ${webRoot}`);
  }

  const address = await app.listen({ port: PORT, host: HOST });
  const actualPort = (app.server.address() as { port: number }).port;
  console.log(`[boot] Listening on http://${HOST}:${actualPort}`);
  // IMPORTANT: Tauri parses this exact line from stdout to discover the port.
  // Do not change the format without updating src-tauri/src/sidecar.rs.
  process.stdout.write(`READY ${actualPort}\n`);

  process.on('SIGTERM', async () => {
    await watcher.stop();
    await app.close();
    db.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w server`
Expected: no errors.

- [ ] **Step 4: Smoke test in normal mode (port 8790, no static serving)**

Run: `npm run dev -w server` in one terminal. Look for `READY 8790` printed to stdout, then `Ctrl+C`.
Expected: `[boot] Listening on http://127.0.0.1:8790` followed by `READY 8790`.

- [ ] **Step 5: Smoke test in bundled mode (port 0, web/dist required)**

First build the web: `npm run build -w web`
Then: `CUD_BUNDLED=1 npm run dev -w server`
Expected: `[boot] Serving static web from <abs>/web/dist`, then `[boot] Listening on http://127.0.0.1:<random>`, then `READY <random>`.

Open `http://127.0.0.1:<random>/` in a browser — dashboard loads. Hit Ctrl+C.

> **Note on path resolution:** the `candidates` array handles both layouts. In local-build mode, compiled `server/dist/index.js` lives at the repo's `server/dist/`, so `../../web/dist` is the matching candidate. In the packaged `.app`, the compiled `server/index.js` lives at `Resources/server/`, so `../dist` (sibling) is the matching candidate. First candidate that exists wins.

- [ ] **Step 6: Commit**

```bash
git add server/src/index.ts server/package.json
git commit -m "feat(server): emit READY <port> and serve web build when CUD_BUNDLED=1"
```

---

### Task M1.7: Implement sidecar.rs — spawn, port discovery, lifecycle

**Files:**
- Create: `src-tauri/src/sidecar.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Create `src-tauri/src/sidecar.rs`**

```rust
use std::sync::Mutex;
use std::time::Duration;
use tauri::async_runtime::JoinHandle;
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::oneshot;
use tokio::time::timeout;

/// Holds the running sidecar process so we can kill it on app exit.
pub struct SidecarState {
    pub child: Mutex<Option<CommandChild>>,
    pub port: Mutex<Option<u16>>,
    pub reader: Mutex<Option<JoinHandle<()>>>,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            port: Mutex::new(None),
            reader: Mutex::new(None),
        }
    }
}

/// Spawn the Node sidecar and wait until it prints `READY <port>` on stdout.
/// Returns the port the server is listening on.
pub async fn start_sidecar<R: Runtime>(app: &AppHandle<R>) -> Result<u16, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir failed: {e}"))?;
    let server_entry = resource_dir.join("server").join("index.js");
    if !server_entry.exists() {
        return Err(format!(
            "server entrypoint not found at {}",
            server_entry.display()
        ));
    }

    let (mut rx, child) = app
        .shell()
        .sidecar("cud-server")
        .map_err(|e| format!("sidecar() failed: {e}"))?
        .args([server_entry.to_string_lossy().to_string()])
        .env("CUD_BUNDLED", "1")
        .spawn()
        .map_err(|e| format!("sidecar spawn failed: {e}"))?;

    let (port_tx, port_rx) = oneshot::channel::<u16>();
    let mut port_tx = Some(port_tx);

    let reader_handle = tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let s = String::from_utf8_lossy(&line);
                    tracing::info!(target: "sidecar", "{s}");
                    if let Some(port_str) = s.trim().strip_prefix("READY ") {
                        if let (Ok(port), Some(tx)) = (port_str.parse::<u16>(), port_tx.take()) {
                            let _ = tx.send(port);
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    tracing::warn!(target: "sidecar", "{}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(e) => {
                    tracing::error!(target: "sidecar", "error: {e}");
                }
                CommandEvent::Terminated(payload) => {
                    tracing::info!(target: "sidecar", "terminated: {:?}", payload);
                    break;
                }
                _ => {}
            }
        }
    });

    let port = timeout(Duration::from_secs(15), port_rx)
        .await
        .map_err(|_| "timed out waiting for sidecar READY".to_string())?
        .map_err(|_| "sidecar exited before READY".to_string())?;

    let state: tauri::State<SidecarState> = app.state();
    *state.child.lock().unwrap() = Some(child);
    *state.port.lock().unwrap() = Some(port);
    *state.reader.lock().unwrap() = Some(reader_handle);

    Ok(port)
}

/// Kill the sidecar gracefully (SIGTERM, then SIGKILL after 2s).
pub fn stop_sidecar(state: &SidecarState) {
    let mut guard = state.child.lock().unwrap();
    if let Some(child) = guard.take() {
        let pid = child.pid();
        tracing::info!(target: "sidecar", "stopping pid {pid}");
        // tauri_plugin_shell::process::CommandChild::kill() sends SIGKILL on Unix.
        // We don't have a clean SIGTERM API here, so we send SIGTERM via libc directly,
        // wait briefly, then kill() as a fallback.
        #[cfg(unix)]
        {
            unsafe {
                libc::kill(pid as libc::pid_t, libc::SIGTERM);
            }
            std::thread::sleep(Duration::from_millis(2000));
        }
        let _ = child.kill();
    }
}
```

- [ ] **Step 2: Add `libc` to Cargo.toml dependencies**

Append to `[dependencies]` in `src-tauri/Cargo.toml`:

```toml
libc = "0.2"
```

- [ ] **Step 3: Modify `src-tauri/src/main.rs` — wire sidecar in setup, kill on exit, navigate webview**

Replace the file contents with:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

use sidecar::{start_sidecar, stop_sidecar, SidecarState};
use tauri::{Manager, RunEvent, WebviewUrl, WindowEvent};

fn main() {
    tracing_subscriber::fmt::init();

    let app = tauri::Builder::default()
        .manage(SidecarState::new())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match start_sidecar(&handle).await {
                    Ok(port) => {
                        let url = format!("http://127.0.0.1:{port}/");
                        tracing::info!("navigating webview to {url}");
                        if let Some(win) = handle.get_webview_window("main") {
                            let _ = win.navigate(url.parse().unwrap());
                        }
                    }
                    Err(e) => {
                        tracing::error!("sidecar startup failed: {e}");
                        // Show the error in the existing window so user has feedback.
                        if let Some(win) = handle.get_webview_window("main") {
                            let html = format!(
                                "<html><body style='font-family:system-ui;padding:32px;background:#0a0a0a;color:#fff'>\
                                 <h1>Failed to start backend</h1><pre>{e}</pre></body></html>"
                            );
                            let data_url = format!("data:text/html;base64,{}", base64_encode(&html));
                            let _ = win.navigate(data_url.parse().unwrap());
                        }
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let state: tauri::State<SidecarState> = window.state();
                stop_sidecar(&state);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            let state: tauri::State<SidecarState> = handle.state();
            stop_sidecar(&state);
        }
    });
}

fn base64_encode(s: &str) -> String {
    use std::fmt::Write;
    const ALPHA: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes = s.as_bytes();
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = chunk.get(1).copied().unwrap_or(0);
        let b2 = chunk.get(2).copied().unwrap_or(0);
        let n = ((b0 as u32) << 16) | ((b1 as u32) << 8) | (b2 as u32);
        let _ = write!(out, "{}", ALPHA[((n >> 18) & 0x3f) as usize] as char);
        let _ = write!(out, "{}", ALPHA[((n >> 12) & 0x3f) as usize] as char);
        if chunk.len() > 1 {
            let _ = write!(out, "{}", ALPHA[((n >> 6) & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            let _ = write!(out, "{}", ALPHA[(n & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}
```

- [ ] **Step 4: Register the sidecar + resources in `tauri.conf.json`**

Edit `src-tauri/tauri.conf.json` — replace the `bundle` block with:

```json
"bundle": {
  "active": true,
  "targets": ["dmg", "app"],
  "externalBin": ["binaries/cud-server"],
  "resources": [
    "../web/dist/**/*",
    "../server/dist/**/*",
    "../server/node_modules/**/*"
  ],
  "icon": [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns"
  ],
  "category": "DeveloperTool",
  "macOS": {
    "minimumSystemVersion": "12.0"
  }
}
```

Notes on this config:
- `externalBin: ["binaries/cud-server"]` — Tauri auto-suffixes the rust target triple, so it looks for `binaries/cud-server-aarch64-apple-darwin`. Signed as part of the main bundle.
- `resources` — copies the compiled server JS, the production `node_modules`, and the React build into `Contents/Resources/`. Tauri preserves the leading directory after `../`, so `web/dist/**/*` lands at `Resources/dist/`, `server/dist/**/*` at `Resources/server/`, and `server/node_modules/**/*` at `Resources/node_modules/` — matching the path resolution from Task M1.6.
- `frontendDist` (set in M1.1) remains `../web/dist` because Tauri requires it; it is harmless when the sidecar redirects the webview to an HTTP URL on launch.

- [ ] **Step 5: Prepare sidecar + build web + tauri dev smoke test**

```bash
npm run prepare:sidecar
npm run build -w web
npm run tauri:dev
```

Expected:
- Tauri window opens (likely blank for ~2s while sidecar boots).
- Server logs appear in terminal: `[boot] Listening on http://127.0.0.1:<random>`, then `READY <random>`.
- Window navigates to `http://127.0.0.1:<random>/` — dashboard loads.
- Close the window — terminal shows `[sidecar] stopping pid <N>` and the Node process exits cleanly (`ps aux | grep node` should show no orphan).

If something fails: check Tauri's stderr output. Common causes:
- Sidecar not found → `prepare-sidecar.mjs` didn't run or external_bin name doesn't match.
- `server/dist/index.js` not found → `npm run build -w server` wasn't run (`tauri:build` script does it, but `tauri:dev` doesn't — run it manually first).
- `READY` not seen → check that `process.stdout.write('READY ...')` from Task M1.6 is unconditional, not gated by some other check.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/sidecar.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
git commit -m "feat(tauri): spawn Node sidecar, parse READY port, navigate webview, kill on quit"
```

---

### Task M1.8: Native macOS menu bar

**Files:**
- Create: `src-tauri/src/menu.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Create `src-tauri/src/menu.rs`**

```rust
use tauri::menu::{
    AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Runtime};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    let about_metadata = AboutMetadataBuilder::new()
        .name(Some("Claude Usage Dashboard"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .website(Some("https://github.com/Mudislandkid/claude-usage-dashboard"))
        .website_label(Some("GitHub"))
        .build();

    let app_submenu = SubmenuBuilder::new(app, "Claude Usage Dashboard")
        .item(&PredefinedMenuItem::about(
            app,
            Some("About Claude Usage Dashboard"),
            Some(about_metadata),
        )?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let reload = MenuItemBuilder::with_id("reload", "Reload")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;

    let view_submenu = SubmenuBuilder::new(app, "View")
        .item(&reload)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    let help_item = MenuItemBuilder::with_id("github", "View on GitHub").build(app)?;
    let help_submenu = SubmenuBuilder::new(app, "Help").item(&help_item).build()?;

    MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&window_submenu)
        .item(&help_submenu)
        .build()
}
```

- [ ] **Step 2: Wire menu into main.rs**

In `src-tauri/src/main.rs`, add `mod menu;` near the top (next to `mod sidecar;`), then inside the builder chain (before `.setup(...)`):

```rust
        .menu(|app| menu::build(app))
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "reload" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.eval("window.location.reload()");
                    }
                }
                "github" => {
                    use tauri_plugin_shell::ShellExt;
                    let _ = app
                        .shell()
                        .open("https://github.com/Mudislandkid/claude-usage-dashboard", None);
                }
                _ => {}
            }
        })
```

- [ ] **Step 3: Smoke test**

```bash
npm run tauri:dev
```

Verify:
- Menu bar shows: Claude Usage Dashboard / Edit / View / Window / Help.
- About dialog opens via menu.
- View → Reload reloads the page.
- Help → View on GitHub opens repo in browser.
- Cmd+W closes window. Cmd+Q quits.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/menu.rs src-tauri/src/main.rs
git commit -m "feat(tauri): native macOS menu bar with About, reload, GitHub link"
```

---

### Task M1.9: Add placeholder icon set

**Files:**
- Create: `src-tauri/icons/icon.png` (1024×1024 PNG)
- Create: `src-tauri/icons/icon.icns` (and other sizes generated by Tauri)

- [ ] **Step 1: Create a placeholder 1024×1024 PNG**

Until final art exists, use a flat-color placeholder. Run:

```bash
mkdir -p src-tauri/icons
# Generate a 1024×1024 dark-mode placeholder with text "CUD" using sips + a base color image.
# Simplest: download Tauri's default dev icon as a starting point.
curl -L -o src-tauri/icons/icon.png \
  https://raw.githubusercontent.com/tauri-apps/tauri/dev/examples/api/src-tauri/icons/icon.png
```

- [ ] **Step 2: Generate the icon set with Tauri's CLI**

```bash
npx tauri icon src-tauri/icons/icon.png
```

Expected: creates `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, and Windows/Linux variants in `src-tauri/icons/`.

- [ ] **Step 3: Verify build picks them up**

```bash
npm run tauri:dev
```

Expected: dock icon and About dialog show the placeholder (Tauri's default `tauri-logo.png` looks like a stylized "T" — that's fine for M1).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/icons/
git commit -m "feat(tauri): placeholder icon set (final art TBD before M3 release)"
```

> **Note for user:** before tagging v0.1.0 in M3, replace `src-tauri/icons/icon.png` with the real 1024×1024 PNG and re-run `npx tauri icon` to regenerate the rest.

---

### Task M1.10: Build unsigned DMG locally and verify it runs

**Files:** (none modified — verification task)

- [ ] **Step 1: Run a full build**

```bash
npm run tauri:build -- --target aarch64-apple-darwin
```

Expected output ends with paths like:
```
Finished `release` profile [optimized] target(s)
Built application at: src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Claude Usage Dashboard.app
Built dmg at: src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Claude Usage Dashboard_0.1.0_aarch64.dmg
```

If signing identity errors appear ("No identity found"), that's expected at M1 — see Step 2.

- [ ] **Step 2: Confirm bundle is unsigned (intentional for M1)**

```bash
codesign -dv "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Claude Usage Dashboard.app" 2>&1 | head -3
```

Expected: `code object is not signed at all`. Confirmed unsigned — signing comes in M2.

If Tauri's bundler failed because it tried to sign automatically, add an empty `macOS.signingIdentity` override to skip signing for M1. In `src-tauri/tauri.conf.json`:

```json
"macOS": {
  "minimumSystemVersion": "12.0",
  "signingIdentity": null
}
```

Re-run the build.

- [ ] **Step 3: Mount the DMG and copy the app to /Applications**

```bash
open "src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Claude Usage Dashboard_0.1.0_aarch64.dmg"
```

In Finder: drag the app to `/Applications`, then run from Spotlight or Launchpad.

Gatekeeper will block: *"Claude Usage Dashboard cannot be opened because it is from an unidentified developer."* Right-click → Open → confirm. (This is the unsigned-app warning, not the notarized "downloaded from Internet" warning — different message, expected at M1.)

- [ ] **Step 4: Verify end-to-end**

The app should open, show the dashboard, scan `~/.claude/projects/`, and operate identically to the browser version.

Test:
- 5h gauge populates (if statusline bridge is configured).
- Project leaderboard shows projects.
- Settings page is reachable.
- Close window → process tree shows no orphan Node.

If anything fails: check the Node process logs by spawning the sidecar manually:
```bash
CUD_BUNDLED=1 "/Applications/Claude Usage Dashboard.app/Contents/MacOS/cud-server-aarch64-apple-darwin" \
  "/Applications/Claude Usage Dashboard.app/Contents/Resources/server/index.js"
```

- [ ] **Step 5: Eject DMG, delete /Applications copy, commit if any config tweaks were needed**

```bash
hdiutil detach "/Volumes/Claude Usage Dashboard"
rm -rf "/Applications/Claude Usage Dashboard.app"
# If signingIdentity: null was added:
git add src-tauri/tauri.conf.json
git commit -m "chore(tauri): explicit unsigned build for M1"
```

**M1 DONE.** You now have a working, unsigned, locally-built Mac app that demonstrates the architecture is sound. Ready for M2.

---

## Milestone M2 — Local signed + notarized DMG

**Outcome:** `npm run tauri:build` on your Mac produces a signed + notarized + stapled `.dmg` that passes Gatekeeper with only the expected first-launch "downloaded from the Internet" prompt.

**Prerequisites (user must complete before M2 starts):**

1. **Developer ID Application certificate** installed in login keychain. Verify with:
   ```bash
   security find-identity -v -p codesigning | grep "Developer ID Application"
   ```
   Expected: at least one identity, e.g., `1) ABCDEF1234... "Developer ID Application: Greg Herriott (TEAMID12345)"`. Note the exact string after the hash — this is `APPLE_SIGNING_IDENTITY`.

2. **App-specific password** generated at https://appleid.apple.com → Sign-in & Security → App-Specific Passwords. Label it "Claude Usage Dashboard notarization". Save the password somewhere safe.

3. **Apple Team ID** — 10-character ID from https://developer.apple.com/account → Membership Details.

---

### Task M2.1: Write entitlements.plist

**Files:**
- Create: `src-tauri/entitlements.plist`

- [ ] **Step 1: Create `src-tauri/entitlements.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
</dict>
</plist>
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/entitlements.plist
git commit -m "feat(tauri): hardened-runtime entitlements for Node sidecar + V8 JIT"
```

---

### Task M2.2: Write sign-native-addons.sh

**Files:**
- Create: `scripts/sign-native-addons.sh`

- [ ] **Step 1: Create `scripts/sign-native-addons.sh`**

```bash
#!/usr/bin/env bash
# Codesigns every .node native addon in server/node_modules with hardened runtime + entitlements.
# Notarization fails if any embedded .node is unsigned. Run this BEFORE `tauri build`.
#
# Required env: APPLE_SIGNING_IDENTITY (exact codesign identity string).

set -euo pipefail

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "ERROR: APPLE_SIGNING_IDENTITY not set" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENTITLEMENTS="${REPO_ROOT}/src-tauri/entitlements.plist"
SEARCH_DIR="${REPO_ROOT}/server/node_modules"

if [[ ! -d "$SEARCH_DIR" ]]; then
  echo "ERROR: ${SEARCH_DIR} does not exist (run npm ci first)" >&2
  exit 1
fi

echo "[sign-addons] Searching for .node files under ${SEARCH_DIR}"
mapfile -t ADDONS < <(find "$SEARCH_DIR" -name "*.node" -type f)

if [[ ${#ADDONS[@]} -eq 0 ]]; then
  echo "[sign-addons] No .node files found — nothing to sign."
  exit 0
fi

for addon in "${ADDONS[@]}"; do
  echo "[sign-addons] Signing: $addon"
  codesign --force --timestamp --options runtime \
    --entitlements "$ENTITLEMENTS" \
    --sign "$APPLE_SIGNING_IDENTITY" \
    "$addon"
  codesign --verify --strict --verbose=2 "$addon"
done

echo "[sign-addons] All ${#ADDONS[@]} addons signed and verified."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/sign-native-addons.sh
```

- [ ] **Step 3: Smoke test**

First ensure `server/node_modules` has been installed prod-only:

```bash
npm ci
npm prune --production -w server
```

Then run with your signing identity:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Greg Herriott (YOUR_TEAM_ID)"
./scripts/sign-native-addons.sh
```

Expected: lists every `.node` (better-sqlite3, fsevents at minimum), signs each, verifies each, prints summary count.

Verify one was actually signed:
```bash
codesign -dv server/node_modules/better-sqlite3/build/Release/better_sqlite3.node 2>&1 | grep "Authority"
```
Expected: `Authority=Developer ID Application: Greg Herriott (...)` line present.

- [ ] **Step 4: Re-install dev deps (so you can keep developing)**

```bash
npm ci
```

- [ ] **Step 5: Commit**

```bash
git add scripts/sign-native-addons.sh
git commit -m "feat(tauri): codesign script for .node native addons"
```

---

### Task M2.3: Configure signing + notarization in tauri.conf.json

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `package.json` (root — update `tauri:build` to invoke sign-addons script)

- [ ] **Step 1: Update tauri.conf.json — signing identity + entitlements**

Replace the `macOS` block under `bundle` with:

```json
"macOS": {
  "minimumSystemVersion": "12.0",
  "signingIdentity": null,
  "entitlements": "entitlements.plist"
}
```

(`signingIdentity` is set to `null` here; Tauri reads `APPLE_SIGNING_IDENTITY` from the environment at build time — keeps per-developer identities out of git. `providerShortName` is not needed for single-team Apple developer accounts; notarytool uses `APPLE_TEAM_ID`.)

- [ ] **Step 2: Update root package.json `tauri:build` script**

Replace the script with one that runs the addon signing step first:

```json
"tauri:build": "npm run build && npm run prepare:sidecar && npm prune --production -w server && bash scripts/sign-native-addons.sh && tauri build"
```

After build completes you'll want to reinstall dev deps, so add an aux script:

```json
"postinstall:dev-deps": "npm ci"
```

(You'll run `npm run postinstall:dev-deps` after a build to restore your dev environment.)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json package.json
git commit -m "feat(tauri): wire signing identity + entitlements via env vars"
```

---

### Task M2.4: Local signed + notarized build

**Files:** (none modified — execution task)

- [ ] **Step 1: Set required environment variables for this shell session**

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Greg Herriott (YOUR_TEAM_ID)"
export APPLE_ID="greg.herriott@outlook.com"
export APPLE_PASSWORD="<app-specific-password-from-prereq-step-2>"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
```

- [ ] **Step 2: Run the full signed + notarized build**

```bash
npm run tauri:build -- --target aarch64-apple-darwin
```

Expected output flow (this will take 5–30 minutes — notarization is the slow step):
1. Web + server compile.
2. Sidecar downloaded (or cached).
3. Server pruned to prod-only.
4. `[sign-addons] All N addons signed and verified.`
5. Tauri bundles `.app`.
6. Tauri signs `.app` with hardened runtime + entitlements.
7. Tauri builds `.dmg`.
8. Tauri signs `.dmg`.
9. Tauri submits to `notarytool` — polls until accepted (`status: Accepted`).
10. Tauri staples the ticket onto the `.dmg`.

Final line: `Built dmg at: src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Claude Usage Dashboard_0.1.0_aarch64.dmg`

If notarytool rejects:
- Run `xcrun notarytool log <submission-id> --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_PASSWORD"` to see what failed.
- Most common cause at this stage: a `.node` addon wasn't signed (verify Task M2.2 ran, check `codesign -dv` on each).
- Second most common: entitlements typo (re-verify Task M2.1 file contents byte-for-byte).

- [ ] **Step 3: Verify signing**

```bash
APP="src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Claude Usage Dashboard.app"
DMG="src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Claude Usage Dashboard_0.1.0_aarch64.dmg"
codesign --verify --deep --strict --verbose=2 "$APP"
spctl --assess --verbose --type execute "$APP"
xcrun stapler validate "$DMG"
```

Expected:
- `codesign --verify`: `Claude Usage Dashboard.app: valid on disk` + `satisfies its Designated Requirement`.
- `spctl --assess`: `accepted` and `source=Notarized Developer ID`.
- `stapler validate`: `The validate action worked!`.

If `spctl` says "source=Developer ID" without "Notarized" — the notarization didn't complete or wasn't stapled. Re-check Step 2's output.

- [ ] **Step 4: Test on a fresh user account (cleanest Gatekeeper UX test)**

If you have a second Mac, copy the DMG there and run. Otherwise create a fresh user account on this Mac (System Settings → Users & Groups → Add User), log in as that user, copy the DMG to their Downloads, and open.

Expected: Single prompt — *"Claude Usage Dashboard is an app downloaded from the Internet. Are you sure you want to open it?"* — click Open. App runs. No other warnings.

- [ ] **Step 5: Restore dev environment**

After a successful build, `server/node_modules` is pruned. Restore dev deps:

```bash
npm run postinstall:dev-deps
```

- [ ] **Step 6: No new commit required for this task** unless you discovered missing configuration. If you did, commit those tweaks before moving on.

**M2 DONE.** Local signed + notarized DMG works. Ready for M3.

---

## Milestone M3 — GitHub Actions + auto-updater + first release

**Outcome:** Pushing a `v*.*.*` tag triggers CI to build, sign, notarize, and publish a release. Installed users get auto-update prompts when a newer release ships.

---

### Task M3.1: Generate Tauri updater keypair

**Files:** (key material lives outside the repo)

- [ ] **Step 1: Generate the Ed25519 keypair**

```bash
mkdir -p ~/.tauri
npm run tauri signer generate -- -w ~/.tauri/cud-updater.key
```

You'll be prompted for a password — set one, save it in 1Password under "CUD Updater Signing Key Password".

Output: `~/.tauri/cud-updater.key` (private), prints the public key to stdout.

- [ ] **Step 2: Back up the private key to 1Password**

```bash
cat ~/.tauri/cud-updater.key
```

Save the content as a Secure Note in 1Password labeled "CUD Updater Signing Key (Private)". **Losing this key means all future updates fail signature verification on installed apps.** Treat it like a master release key.

- [ ] **Step 3: Note the public key for the next task**

```bash
cat ~/.tauri/cud-updater.key.pub
```

Copy the entire string — you'll paste it into `tauri.conf.json` in Task M3.2.

---

### Task M3.2: Configure updater plugin

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml` (already has `tauri-plugin-updater` from M1.1)
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add updater plugin config to tauri.conf.json**

Add a `plugins` section at the top level (sibling to `app`, `bundle`):

```json
"plugins": {
  "updater": {
    "active": true,
    "pubkey": "<PASTE-PUBKEY-FROM-M3.1-STEP-3>",
    "endpoints": [
      "https://github.com/Mudislandkid/claude-usage-dashboard/releases/latest/download/latest.json"
    ]
  }
}
```

Also enable updater artifact creation by adding to the `bundle` block:

```json
"createUpdaterArtifacts": true
```

- [ ] **Step 2: Register the updater plugin in main.rs**

In `src-tauri/src/main.rs`, add to the builder chain (next to other plugins):

```rust
        .plugin(tauri_plugin_updater::Builder::new().build())
```

- [ ] **Step 3: Verify the Rust build still compiles**

```bash
cd src-tauri && cargo check && cd ..
```

Expected: builds successfully.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/src/main.rs
git commit -m "feat(tauri): configure updater plugin with GitHub releases endpoint"
```

---

### Task M3.3: Web — install and wire updater plugin

**Files:**
- Modify: `web/package.json`
- Modify: `web/src/main.tsx`
- Create: `web/src/lib/updater.ts`

- [ ] **Step 1: Install updater plugin in web workspace**

```bash
npm install @tauri-apps/api@^2 @tauri-apps/plugin-updater@^2 -w web
```

- [ ] **Step 2: Create `web/src/lib/updater.ts`**

```typescript
// Auto-update check for the Tauri-packaged app.
// In browser mode (no Tauri runtime present), this is a no-op.

export async function checkForUpdates(): Promise<void> {
  if (typeof window === 'undefined') return;
  // Tauri 2.x injects this. If absent, we're in browser dev mode.
  if (!('__TAURI_INTERNALS__' in window)) return;

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return;

    const proceed = window.confirm(
      `An update is available: v${update.version}\n\n` +
        (update.body ? `${update.body}\n\n` : '') +
        'Download and install now? The app will restart.',
    );
    if (!proceed) return;

    await update.downloadAndInstall();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (err) {
    console.warn('[updater] check failed:', err);
  }
}
```

- [ ] **Step 3: Add `@tauri-apps/plugin-process` (needed for relaunch)**

```bash
npm install @tauri-apps/plugin-process@^2 -w web
```

And in `src-tauri/Cargo.toml`, append to `[dependencies]`:

```toml
tauri-plugin-process = "2"
```

In `src-tauri/src/main.rs` builder chain:

```rust
        .plugin(tauri_plugin_process::init())
```

- [ ] **Step 4: Call `checkForUpdates` from main.tsx**

Edit `web/src/main.tsx`. After the existing `createRoot(...).render(...)` call, add:

```typescript
import { checkForUpdates } from './lib/updater';

// Fire-and-forget update check 3s after mount (don't block initial paint).
setTimeout(() => {
  void checkForUpdates();
}, 3000);
```

- [ ] **Step 5: Typecheck web**

```bash
npm run typecheck -w web
```

Expected: no errors.

- [ ] **Step 6: Smoke test in tauri:dev** (updater will silently no-op because GitHub release doesn't exist yet)

```bash
npm run tauri:dev
```

Expected: app starts, no errors in console. (You can't fully test the update path until M3.7.)

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/package-lock.json web/src/lib/updater.ts web/src/main.tsx src-tauri/Cargo.toml src-tauri/src/main.rs
git commit -m "feat(updater): wire @tauri-apps/plugin-updater check on app start"
```

---

### Task M3.4: PR-trigger CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  typecheck-test:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm test

  tauri-smoke-build:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri -> target
      - run: npm ci
      - run: npm run build
      - run: npm run prepare:sidecar
      # Unsigned smoke build — just verifies the bundle assembles cleanly.
      - run: npx tauri build --target aarch64-apple-darwin --no-bundle
        env:
          # Skip codesigning entirely for smoke build.
          APPLE_SIGNING_IDENTITY: ''
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck + test + tauri smoke build on PRs"
git push
```

- [ ] **Step 3: Open a PR (or push to a branch) and verify CI passes**

In GitHub UI, confirm both jobs go green within ~10 minutes.

---

### Task M3.5: Configure GitHub Actions secrets

**Files:** (configured in GitHub UI — no repo changes)

- [ ] **Step 1: Export the Apple cert as .p12**

In Keychain Access (login keychain):
1. Find your `Developer ID Application: Greg Herriott (...)` certificate.
2. Click the disclosure triangle — there should be a private key beneath it. Select **both** the cert and the key.
3. Right-click → Export 2 items → format: `Personal Information Exchange (.p12)`.
4. Choose a strong password — save in 1Password as "CUD Apple Cert P12 Password".
5. Save as `~/cud-developer-id.p12`.

- [ ] **Step 2: Base64 encode the .p12**

```bash
base64 -i ~/cud-developer-id.p12 -o ~/cud-developer-id.p12.b64
cat ~/cud-developer-id.p12.b64 | pbcopy
```

The base64 string is now in your clipboard.

- [ ] **Step 3: Add all 8 secrets to the GitHub repo**

Go to https://github.com/Mudislandkid/claude-usage-dashboard/settings/secrets/actions → New repository secret. Add each:

| Name | Value |
|---|---|
| `APPLE_CERTIFICATE_P12_BASE64` | (paste from clipboard — the .p12 base64) |
| `APPLE_CERTIFICATE_PASSWORD` | (the password from Step 1) |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Greg Herriott (YOUR_TEAM_ID)` (exact string) |
| `APPLE_ID` | `greg.herriott@outlook.com` |
| `APPLE_PASSWORD` | (app-specific password from M2 prereq Step 2) |
| `APPLE_TEAM_ID` | (your 10-char Team ID) |
| `TAURI_SIGNING_PRIVATE_KEY` | (contents of `~/.tauri/cud-updater.key` from M3.1 — `cat` it and paste the whole thing) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | (the password you set when generating the key in M3.1) |

- [ ] **Step 4: Clean up local copies of cert export**

```bash
shred -u ~/cud-developer-id.p12.b64
# Keep ~/cud-developer-id.p12 as a backup, or shred it too if you have the original cert in keychain.
```

- [ ] **Step 5: No commit — secrets are GitHub-side only**

---

### Task M3.6: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build-and-release:
    runs-on: macos-14
    permissions:
      contents: write
    env:
      APPLE_CERTIFICATE_P12_BASE64: ${{ secrets.APPLE_CERTIFICATE_P12_BASE64 }}
      APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
      APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
      APPLE_ID: ${{ secrets.APPLE_ID }}
      APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
      APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri -> target

      - name: Import Apple cert into temp keychain
        run: |
          KEYCHAIN_PATH="$RUNNER_TEMP/cud-build.keychain-db"
          KEYCHAIN_PASSWORD=$(openssl rand -base64 32)
          echo "KEYCHAIN_PATH=$KEYCHAIN_PATH" >> $GITHUB_ENV
          echo "$APPLE_CERTIFICATE_P12_BASE64" | base64 --decode > $RUNNER_TEMP/cert.p12
          security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
          security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
          security import $RUNNER_TEMP/cert.p12 -P "$APPLE_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
          security set-key-partition-list -S apple-tool:,apple: -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
          security list-keychain -d user -s "$KEYCHAIN_PATH" $(security list-keychain -d user | tr -d \")
          security find-identity -v -p codesigning
          rm $RUNNER_TEMP/cert.p12

      - name: Install dependencies
        run: npm ci

      - name: Build server + web
        run: npm run build

      - name: Prepare sidecar (download Node 20)
        run: npm run prepare:sidecar

      - name: Prune server to production deps
        run: npm prune --production -w server

      - name: Sign native .node addons
        run: bash scripts/sign-native-addons.sh

      - name: Tauri build (sign + notarize + staple)
        run: npx tauri build --target aarch64-apple-darwin

      - name: Verify signing and notarization
        run: |
          APP="src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Claude Usage Dashboard.app"
          DMG=$(ls src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg)
          codesign --verify --deep --strict --verbose=2 "$APP"
          spctl --assess --verbose --type execute "$APP"
          xcrun stapler validate "$DMG"

      - name: Collect release artifacts
        id: artifacts
        run: |
          mkdir -p release-assets
          cp src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg release-assets/
          cp src-tauri/target/aarch64-apple-darwin/release/bundle/macos/*.app.tar.gz release-assets/ 2>/dev/null || true
          cp src-tauri/target/aarch64-apple-darwin/release/bundle/macos/*.app.tar.gz.sig release-assets/ 2>/dev/null || true
          cp src-tauri/target/aarch64-apple-darwin/release/bundle/macos/latest.json release-assets/ 2>/dev/null || true
          ls -la release-assets/

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: release-assets/*
          generate_release_notes: true
          fail_on_unmatched_files: true

      - name: Clean up temp keychain
        if: always()
        run: |
          security delete-keychain "$KEYCHAIN_PATH" || true
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): tag-triggered build, sign, notarize, GitHub release"
git push
```

- [ ] **Step 3: Sanity-check the workflow renders correctly in GitHub UI**

Navigate to Actions tab → confirm "Release" workflow appears. Don't tag yet.

---

### Task M3.7: Ship v0.1.0 (baseline release)

**Files:**
- Modify: `package.json` (root), `web/package.json`, `server/package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` — bump version to `0.1.0` if not already there.

- [ ] **Step 1: Replace the placeholder icon with final art**

If you have a real 1024×1024 icon, place it at `src-tauri/icons/icon.png` and run:

```bash
npx tauri icon src-tauri/icons/icon.png
git add src-tauri/icons/
git commit -m "feat(tauri): final app icon"
```

If you don't have final art yet, you can skip this and ship v0.1.0 with the placeholder. Add a TODO to the README.

- [ ] **Step 2: Verify version is 0.1.0 everywhere**

Check that `package.json`, `web/package.json`, `server/package.json`, `src-tauri/Cargo.toml` (`version =`), and `src-tauri/tauri.conf.json` (`"version"`) all say `0.1.0`. They should already from M1.1 — fix any drift.

- [ ] **Step 3: Tag and push**

```bash
git tag v0.1.0
git push origin v0.1.0
```

- [ ] **Step 4: Watch the release workflow in GitHub Actions**

Should complete in ~15–35 minutes. The slow steps are `npm ci` (~2m), Rust compilation (~5m on first run, ~30s cached), and notarization (~5–20m).

If it fails, check the workflow logs. Common first-run issues:
- Cert import failed: re-check `APPLE_CERTIFICATE_P12_BASE64` encoding (must be raw base64, no line wrapping issues).
- Signing identity mismatch: `APPLE_SIGNING_IDENTITY` must be the *exact* string from `security find-identity`.
- Notarization rejected: check the notarytool log via `xcrun notarytool log <id>`.

- [ ] **Step 5: Verify the release**

Once green, visit https://github.com/Mudislandkid/claude-usage-dashboard/releases/tag/v0.1.0. Confirm assets attached:
- `Claude Usage Dashboard_0.1.0_aarch64.dmg`
- `Claude Usage Dashboard_0.1.0_aarch64.app.tar.gz`
- `Claude Usage Dashboard_0.1.0_aarch64.app.tar.gz.sig`
- `latest.json`

Download the DMG, install, and confirm Gatekeeper shows only the "downloaded from Internet" prompt.

---

### Task M3.8: Ship v0.1.1 to validate the update path

**Files:**
- Modify: version files (same five as M3.7 Step 2).

- [ ] **Step 1: Bump version to 0.1.1 in all five places**

Edit:
- `package.json` root → `"version": "0.1.1"`
- `web/package.json` → `"version": "0.1.1"`
- `server/package.json` → `"version": "0.1.1"`
- `src-tauri/Cargo.toml` → `version = "0.1.1"`
- `src-tauri/tauri.conf.json` → `"version": "0.1.1"`

- [ ] **Step 2: Make a trivial visible change so you can confirm the update applied**

E.g., add a release note in the README or change the window title temporarily to `Claude Usage Dashboard (v0.1.1)`. Revert later or leave it.

- [ ] **Step 3: Commit, tag, push**

```bash
git add .
git commit -m "chore: bump version to 0.1.1"
git tag v0.1.1
git push && git push origin v0.1.1
```

- [ ] **Step 4: Wait for the release workflow to complete**

- [ ] **Step 5: Open the v0.1.0 install** (the one already on your machine from M3.7 Step 5)

Within ~3 seconds of launching, the updater check fires. You should see a confirm dialog: *"An update is available: v0.1.1 — Download and install now?"*

Click OK. The app downloads the update, verifies signature, swaps the bundle, and relaunches as v0.1.1.

Verify the visible change from Step 2 is present after relaunch — confirms update applied.

- [ ] **Step 6: README update + final commit**

Add to `README.md` a new section near the top:

```markdown
## Download for macOS

Latest signed + notarized DMG for Apple Silicon: [Releases](https://github.com/Mudislandkid/claude-usage-dashboard/releases/latest)

The app auto-updates when new versions are released.
```

Commit:
```bash
git add README.md
git commit -m "docs: link Mac DMG downloads from README"
git push
```

**M3 DONE.** Auto-update verified end-to-end. Ship cycle is now: bump version → tag → push → wait → users get notified.

---

## Acceptance checklist (whole project)

- [ ] `npm run dev` (browser mode) still works exactly as before — backward-compatible.
- [ ] `npm run tauri:dev` opens a Mac window with HMR, dashboard fully functional.
- [ ] `npm run tauri:build` locally produces a signed, notarized, stapled DMG.
- [ ] CI's `release.yml` produces the same on `vX.Y.Z` tag push.
- [ ] Installing from the GitHub-released DMG triggers only the standard "downloaded from Internet" Gatekeeper prompt.
- [ ] Auto-update flow tested end-to-end (v0.1.0 → v0.1.1).
- [ ] No orphan Node processes after closing the app window.
- [ ] OAuth keychain access prompts once on first signed-app launch, then silent.
- [ ] All `*.node` addons are codesigned (verifiable with `codesign -dv`).
- [ ] Server config tests pass (`npm test -w server`).
