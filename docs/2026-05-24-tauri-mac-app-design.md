# Tauri Mac App — Design

**Status:** approved, pending implementation plan
**Date:** 2026-05-24
**Author:** Greg Herriott
**Scope:** Package the existing claude-usage-dashboard webapp as a standalone, code-signed, notarized macOS application for Apple Silicon. Distribute via GitHub releases as a `.dmg`. Support in-app auto-updates.

---

## 1. Goal

Ship `Claude Usage Dashboard.app` as a downloadable, double-clickable Mac app that:

- Runs on Apple Silicon (arm64) Macs.
- Is signed with a Developer ID Application certificate and notarized by Apple — so Gatekeeper allows it with only the one expected "downloaded from the Internet" warning on first launch.
- Auto-updates via GitHub releases using Tauri's built-in updater.
- Preserves the existing webapp behavior 1:1: same dashboard, same scanner, same OAuth fetcher, same statusline bridge.
- Leaves the existing browser-mode dev workflow (`npm run dev`) fully working.

Non-goals for v1: Windows/Linux builds, Mac App Store distribution, menu-bar/dock-badge integration, in-app license dialog.

---

## 2. Architecture decision: Tauri shell + Node sidecar

Tauri's native runtime is Rust + webview; it does not host Node. The backend is Node + Fastify + `better-sqlite3` (native addon) + `chokidar` + a `security` CLI shellout for keychain access. Three approaches were considered:

| Approach | Trade-off | Decision |
|---|---|---|
| Bundle Node sidecar | Smallest code change. `better-sqlite3`, `chokidar`, `security` shellout all keep working. ~80–120MB DMG. | **Chosen.** |
| Single-binary via Node SEA / pkg | Slightly smaller, but `better-sqlite3` `.node` addon extraction at runtime is fragile. | Rejected. |
| Port server to Rust (axum + rusqlite + notify) | ~15MB DMG, no Node, cleanest. Effectively a full backend rewrite. | Rejected — scope. |

**Chosen architecture:**

```
Claude Usage Dashboard.app/
└── Contents/
    ├── MacOS/
    │   ├── claude-usage-dashboard               ← Tauri Rust binary (the app)
    │   └── cud-server-aarch64-apple-darwin      ← Node 20 runtime (sidecar)
    ├── Resources/
    │   ├── dist/                                ← built React (from web/dist)
    │   ├── server/                              ← compiled server JS (from server/dist)
    │   └── node_modules/                        ← server prod deps, arm64 prebuilds
    ├── Info.plist
    └── _CodeSignature/
```

At launch the Tauri Rust shell spawns the sidecar as `cud-server-aarch64-apple-darwin Resources/server/index.js` with env `CUD_BUNDLED=1`. The sidecar binds Fastify to `127.0.0.1:0` (OS picks a free port), prints `READY <port>` to stdout. Tauri reads stdout until it sees `READY`, then injects `window.__CUD_PORT__ = <port>` into the webview before navigation. The webview loads `http://127.0.0.1:<port>/`, where Fastify serves the React build via `@fastify/static` plus the existing API routes.

In dev (`npm run tauri:dev`), the webview points at Vite's HMR server (`http://localhost:5173`) and the sidecar is the local `tsx watch` server — identical to today's `npm run dev`, just wrapped in a Tauri window.

---

## 3. Sidecar packaging

**Node binary:** Tauri's sidecar mechanism requires external binaries to be named `<basename>-<rust-target-triple>` and registered under `bundle.externalBin` in `tauri.conf.json`. We download the official Node 20 LTS arm64-darwin tarball, extract `bin/node`, rename to `cud-server-aarch64-apple-darwin`, and place in `src-tauri/binaries/`. This step is automated by `scripts/prepare-sidecar.mjs` so it runs in both local dev setup and CI.

**Native addons:** `better-sqlite3` and `chokidar`'s optional `fsevents` are native `.node` addons. CI runs on `macos-14` runners (arm64 native) so addons compile from source if no prebuild exists. We pin Node version explicitly so prebuild lookups are deterministic.

**Pruning:** Before bundling, `npm prune --production -w server` removes devDeps from `server/node_modules`. The pruned tree is what Tauri's bundler copies into `Resources/`.

---

## 4. Port discovery and process lifecycle

**Server changes (`server/src/config.ts`, `server/src/index.ts`):**

- `PORT` defaults to `0` if `process.env.CUD_BUNDLED === '1'`, else keeps current `8790` default.
- After `app.listen(...)`, read the actual bound port from Fastify and `process.stdout.write('READY ' + port + '\n')`.
- When `CUD_BUNDLED=1`, register `@fastify/static` to serve `../dist/` (the React build inside `Resources/`).

**Web changes (`web/src/lib/api.ts` or equivalent):**

- API base URL = `\`http://127.0.0.1:${window.__CUD_PORT__}\`` if defined, else `''` (relative — browser-mode behavior unchanged).

**Tauri Rust shell (`src-tauri/src/sidecar.rs`, `main.rs`):**

- On `setup`, spawn the sidecar via Tauri's `Command::new_sidecar("cud-server")`, capture stdout line-by-line, wait for `READY <port>` (10s timeout → user-facing error window), store port + child handle in managed state.
- Inject `window.__CUD_PORT__` via `tauri::WebviewWindow::eval` before `window.location` navigation; navigate to `http://127.0.0.1:<port>/`.
- On `WindowEvent::CloseRequested` (window close): send SIGTERM to sidecar, wait 2s, send SIGKILL if still alive, then `app.exit(0)`.
- Register cleanup on `Drop` of the sidecar handle and on Rust panic to ensure the Node process never orphans.

---

## 5. macOS specifics

**Window chrome / OS integration (v1 = "standard Mac app"):**

- Native traffic-light buttons, default window controls.
- Standard menu bar: File, Edit (with native Cut/Copy/Paste/Select All), View (with Reload + Toggle Full Screen), Window (with Minimize + Zoom), Help (with link to GitHub repo). Implemented in `src-tauri/src/menu.rs` using Tauri's native menu API.
- About dialog showing version + GitHub URL.
- Window remembers size and position across launches (Tauri's built-in state plugin).

**App identity:**

- Bundle ID: `com.lunawispdesigns.claude-usage-dashboard`
- Display name: `Claude Usage Dashboard`
- Apple Team: personal account (Greg Herriott)
- Category: `public.app-category.developer-tools`

**Icon:** placeholder `.icns` for M1; user supplies final artwork before M3 (first signed release). `src-tauri/icons/` follows Tauri's standard set (16/32/64/128/256/512 + @2x variants + `icon.icns` for macOS).

**Entitlements (`src-tauri/entitlements.plist`):**

```xml
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
<key>com.apple.security.cs.disable-library-validation</key><true/>
<key>com.apple.security.cs.allow-dyld-environment-variables</key><true/>
<key>com.apple.security.network.client</key><true/>
```

Rationale: V8 needs JIT + unsigned-executable-memory. `disable-library-validation` lets Node load `.node` addons signed by us, not Apple. `allow-dyld-environment-variables` lets Node honor environment config. `network.client` is required for the OAuth fetcher to reach `api.anthropic.com`. **Not** sandboxed — the app reads arbitrary files under `~/.claude/projects/` and spawns the `security` CLI; sandboxing would require explicit user file picks. Notarization does not require sandboxing.

**Keychain ACL:** First time the OAuth fetcher runs from the signed `.app` binary (a different binary identity than `node` from the CLI), macOS prompts the user to allow `Claude Code-credentials` access. User clicks "Always Allow"; subsequent fetches are silent. Same behavior as the current browser-mode app — just attached to a new binary identity. Documented in README + in-app settings panel.

---

## 6. Code signing and notarization

**Signing identity:** Existing `Developer ID Application: Greg Herriott (<TEAMID>)` certificate from login keychain. For CI, exported as `.p12`, base64-encoded, stored as a GitHub Actions secret.

**Signing order (inside-out, explicit — not `--deep`):**

1. Codesign `Resources/node_modules/**/*.node` (each native addon) with hardened runtime + entitlements.
2. Codesign the sidecar `Contents/MacOS/cud-server-aarch64-apple-darwin` (Node binary) with hardened runtime + entitlements.
3. Codesign the main Tauri binary.
4. Codesign the `.app` bundle as a whole.
5. Tauri builds the `.dmg`.
6. Codesign the `.dmg`.
7. Submit `.dmg` to Apple's `notarytool`.
8. `xcrun stapler staple` the notarization ticket onto the `.dmg` so it works offline.

Tauri's bundler handles steps 2–7 when `tauri.conf.json` is configured with `macOS.signingIdentity`, `macOS.entitlements`, `macOS.providerShortName`, and `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` env vars are set. Step 1 (native addons) is the failure mode that bites people most often, so we add `scripts/sign-native-addons.sh` to be invoked by the build script before Tauri starts bundling.

**Verification gates (build fails if either fails):**

- `spctl --assess --verbose --type execute "<path>/Claude Usage Dashboard.app"` must report `accepted source=Notarized Developer ID`.
- `xcrun stapler validate "<path>/Claude Usage Dashboard_<version>_aarch64.dmg"` must succeed.

**User experience on download:** On first open, Gatekeeper shows one prompt: *"Claude Usage Dashboard is an app downloaded from the Internet. Are you sure you want to open it?"* — the standard prompt for any notarized internet download; cannot be suppressed without distributing through the Mac App Store. No "unidentified developer" warning, no quarantine block.

---

## 7. GitHub Actions release pipeline

**Workflow file:** `.github/workflows/release.yml`

**Trigger:** `push: tags: ['v*.*.*']`

**Runner:** `macos-14` (Apple Silicon, native arm64 — `better-sqlite3` and `fsevents` compile correctly without cross-compile gymnastics).

**Steps:**

1. Checkout, setup Node 20 (pinned), setup Rust stable, restore Cargo + npm caches.
2. Decode `APPLE_CERTIFICATE_P12_BASE64` into a temp keychain, import cert with `APPLE_CERTIFICATE_PASSWORD`, unlock keychain, set as default for codesigning.
3. `npm ci` at root (installs both workspaces).
4. `npm run build` (`server/dist` + `web/dist`).
5. `npm prune --production -w server`.
6. `node scripts/prepare-sidecar.mjs` (downloads Node 20 arm64, places in `src-tauri/binaries/cud-server-aarch64-apple-darwin`).
7. `bash scripts/sign-native-addons.sh` (codesigns every `**/*.node` under `server/node_modules`).
8. `npm run tauri:build -- --target aarch64-apple-darwin` (bundles, signs, notarizes, staples).
9. Verification gates: `spctl --assess` on `.app`, `xcrun stapler validate` on `.dmg`. Fail workflow on either failure.
10. Use `softprops/action-gh-release` to create a GitHub release for the tag, attaching:
    - `Claude Usage Dashboard_<version>_aarch64.dmg`
    - `Claude Usage Dashboard_<version>_aarch64.app.tar.gz` (updater artifact)
    - `Claude Usage Dashboard_<version>_aarch64.app.tar.gz.sig` (updater signature)
    - `latest.json` (updater manifest)
11. `always()` cleanup: delete temp keychain.

**Required GitHub Actions secrets (one-time setup):**

| Secret | Source |
|---|---|
| `APPLE_CERTIFICATE_P12_BASE64` | Keychain Access → export Developer ID Application as `.p12`, then `base64 -i cert.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Password chosen during `.p12` export |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Greg Herriott (TEAMID)` (exact match required by codesign) |
| `APPLE_ID` | Apple ID email associated with the developer account |
| `APPLE_PASSWORD` | App-specific password from appleid.apple.com → Sign-in & Security → App-Specific Passwords |
| `APPLE_TEAM_ID` | 10-char team ID from developer.apple.com membership page |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater Ed25519 private key (generated once with `npm run tauri signer generate`) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password chosen when generating the key |

A separate `.github/workflows/ci.yml` runs typecheck + tests + a Tauri build smoke test (unsigned, no notarization) on PRs to catch breakage early without burning notarization quota.

---

## 8. Auto-updater

**Plugin:** Tauri's first-party `@tauri-apps/plugin-updater`. Uses Ed25519 signatures separate from Apple code signing.

**Key generation (one-time, local):**

```bash
npm run tauri signer generate -- -w ~/.tauri/cud-updater.key
```

Public key is committed in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`. Private key + its password are stored as GitHub Actions secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` and also backed up to a password manager (1Password). **If the private key is lost**, all future updates will fail signature verification on existing installs; recovery requires shipping a new app with a new pubkey, which existing users must download manually as a fresh DMG. Treat this key like a release-signing key.

**Update endpoint:** `https://github.com/<user>/claude-usage-dashboard/releases/latest/download/latest.json`. GitHub's `/latest/download/` redirect resolves to whichever release is marked Latest. No external hosting needed.

**`latest.json` (Tauri-produced):**

```json
{
  "version": "0.2.0",
  "notes": "see release notes",
  "pub_date": "2026-05-24T20:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<base64 ed25519 sig>",
      "url": "https://github.com/.../Claude Usage Dashboard_0.2.0_aarch64.app.tar.gz"
    }
  }
}
```

**Update flow at runtime:**

1. App launches, updater plugin fetches `latest.json` (silent failure if offline).
2. If `version` > `package.version`, React surfaces an "Update available — install now? (will relaunch)" dialog.
3. On user accept, plugin downloads the `.app.tar.gz`, verifies Ed25519 signature against the baked-in pubkey, swaps the `.app` in place, relaunches.
4. Because the new `.app` is also Apple-notarized, Gatekeeper does not re-prompt the user — the update is silent at the OS level.

**Bootstrap:** v0.1.0 is the baseline (no prior version to update from). v0.2.0 is the first release that exercises the update path. M3 explicitly ships both back-to-back to validate this.

---

## 9. Repo layout — additions and modifications

**New files / directories:**

```
src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── build.rs
├── entitlements.plist
├── icons/                          (placeholder set for M1)
├── binaries/                       (gitignored; populated by prepare-sidecar.mjs)
│   └── .gitkeep
└── src/
    ├── main.rs                     (entry, app builder, menu wiring)
    ├── sidecar.rs                  (spawn / port discovery / lifecycle)
    └── menu.rs                     (native macOS menu definitions)

scripts/
├── prepare-sidecar.mjs             (downloads Node 20 arm64 → src-tauri/binaries/)
└── sign-native-addons.sh           (codesigns server/node_modules/**/*.node)

.github/workflows/
├── release.yml                     (tag-triggered signed release)
└── ci.yml                          (PR-triggered typecheck/test/smoke-build)
```

**Modified files:**

| File | Change |
|---|---|
| `package.json` (root) | Add scripts: `tauri:dev`, `tauri:build`, `prepare:sidecar`. Add `@tauri-apps/cli` to devDependencies. |
| `web/package.json` | Add `@tauri-apps/api` and `@tauri-apps/plugin-updater` to dependencies. |
| `web/src/lib/api.ts` (or equivalent module containing the API base URL) | Use `window.__CUD_PORT__` when present; else fall back to relative URLs. |
| `web/src/main.tsx` | When running inside Tauri (`window.__TAURI__` defined), register updater check on mount. |
| `server/src/config.ts` | `PORT` defaults to `0` when `process.env.CUD_BUNDLED === '1'`; otherwise unchanged. |
| `server/src/index.ts` | Print `READY <port>` after `listen()`. Register `@fastify/static` for `../dist/` when `CUD_BUNDLED=1`. |
| `.gitignore` | Add `src-tauri/target/`, `src-tauri/binaries/cud-server-*`, `*.dmg`, `*.app`. |
| `README.md` | New "Download for macOS" section linking to GitHub releases. Note dev-mode and Tauri-mode both work. |

**Files NOT changed:**

- `server/src/scanner/`, `server/src/watcher/`, `server/src/api/`, `server/src/db/`, `server/src/lib/`, `server/src/git/`, `server/src/pricing.ts` — backend logic is untouched.
- `web/src/components/`, `web/src/hooks/`, `web/src/pages/` — UI is untouched.

This is a packaging change, not a refactor.

---

## 10. Phasing

Three milestones, each independently shippable and committable. Each milestone reduces a distinct category of risk before the next is started.

### M1 — Local Tauri build (unsigned)

**Goal:** Validate the architecture works end-to-end on the local machine.

**Deliverables:**

- `src-tauri/` scaffolded with Cargo.toml, tauri.conf.json, main.rs, sidecar.rs, menu.rs.
- `scripts/prepare-sidecar.mjs` downloads Node 20 arm64 into `src-tauri/binaries/`.
- Server emits `READY <port>` and serves React build under `CUD_BUNDLED=1`.
- Web reads `window.__CUD_PORT__`.
- `npm run tauri:dev` opens a Tauri window pointing at Vite HMR — full dashboard works.
- `npm run tauri:build` produces an unsigned `.app` and `.dmg` locally — opens and works (with Gatekeeper warning, which is expected for unsigned).
- Native menu bar wired up.

**Risk addressed:** Sidecar spawning, port discovery, lifecycle, native addon loading inside `.app`.

### M2 — Local signed + notarized DMG

**Goal:** End-to-end signing and notarization succeeds locally before involving CI.

**Deliverables:**

- `src-tauri/entitlements.plist` written.
- `tauri.conf.json` populated with signing identity, entitlements, provider short name, updater pubkey.
- `scripts/sign-native-addons.sh` codesigns every `.node` before bundling.
- Local `tauri build` produces a signed + notarized + stapled `.dmg`.
- `spctl --assess` and `xcrun stapler validate` both pass.
- Manual verification: install on a second Mac (or fresh user account) — only the expected "downloaded from Internet" prompt appears.

**Risk addressed:** Signing order, entitlements correctness, notarization rejections from unsigned addons, keychain ACL behavior under signed identity.

### M3 — GitHub Actions + auto-updater + first release

**Goal:** Reproducible signed release pipeline + working update mechanism.

**Deliverables:**

- All 8 secrets configured in GitHub repo.
- `.github/workflows/release.yml` and `ci.yml` written.
- Updater keypair generated; pubkey committed; private key in secret + 1Password backup.
- v0.1.0 tagged + released through CI → DMG attached to GitHub release.
- v0.2.0 tagged + released → installed v0.1.0 detects the update, downloads, verifies, relaunches.

**Risk addressed:** CI environment differences vs local, secret handling, updater signature flow, real-world upgrade UX.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `better-sqlite3` or `fsevents` `.node` not signed → notarization rejects | `scripts/sign-native-addons.sh` walks `**/*.node` and signs each; CI verifies with `codesign -dv` before notarization submission. |
| DMG size 80–120MB feels heavy | Acceptable trade-off vs Node SEA fragility. Documented expectation. |
| Updater private key lost | Generated once, backed up to 1Password. Documented as a release-signing key. Recovery = ship new app with new pubkey; existing users do manual reinstall. |
| Keychain ACL prompts user for OAuth credential access on first fetch from signed app | Expected behavior. Document in README and in-app settings panel. User clicks "Always Allow" once. |
| Notarization takes 5–60 minutes | Tag-trigger means it's never blocking a PR merge; workflow polls notarytool with reasonable timeout. |
| `fsevents` blocked by TCC for some users | `~/.claude/projects` is under user home (not Documents/Desktop) — should not trigger TCC. If it does, fall back to chokidar polling mode. |
| Apple changes notarization API / cert formats | Pin Tauri version in `Cargo.lock`; update deliberately, not automatically. |
| Sidecar Node process orphaned if Tauri Rust shell crashes | Rust `Drop` impl on the sidecar handle + panic handler send SIGTERM/SIGKILL. Tested in M1. |

---

## 12. Out of scope (v1)

- Windows / Linux builds — separate spec when needed.
- Mac App Store distribution — different sandboxing + entitlements story.
- Menu bar app / dock badge / native notifications — chose "standard Mac app" polish level, not "full polish".
- In-app license/EULA dialog — open-source MIT, not required.
- Universal (arm64 + x86_64) binary — chose Apple Silicon only.

---

## 13. Next step

This spec is complete. Implementation work is broken down by `superpowers:writing-plans` into a step-by-step plan that follows the M1 → M2 → M3 phasing above.
