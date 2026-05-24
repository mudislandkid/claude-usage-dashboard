# Tauri Mac App — Handoff Steps

This is the checklist for steps that only **you** can do: anything requiring your Apple Developer account credentials, GitHub repo admin access, key backups to 1Password, or tag pushes to ship a release.

The codebase work for M1, M2, and M3 is complete on branch `worktree-feat+tauri-mac-app` (currently a worktree at `.claude/worktrees/feat+tauri-mac-app/`). Once you've worked through this doc you'll have:

1. A locally-built, signed, notarized DMG on your Mac (M2)
2. The updater keypair in 1Password (M3.1)
3. All 8 GitHub secrets configured (M3.5)
4. v0.1.0 released through CI (M3.7)
5. v0.1.1 released, confirming auto-update works end-to-end (M3.8)

Stages are designed to be done one at a time. You can stop at any stage and resume later — each one ends in a verifiable state.

---

## Stage 0 — Prerequisites (5 minutes)

Verify all the moving pieces are in place before touching any signing UI.

### 0.1 Confirm Developer ID Application certificate

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

Expected output: at least one identity, e.g.:
```
1) ABC1234567890DEF... "Developer ID Application: Greg Herriott (TEAMID12345)"
```

Save the exact quoted string — that's your `APPLE_SIGNING_IDENTITY`. The 10-character code in parens at the end is your `APPLE_TEAM_ID`.

**If nothing matches:** the cert isn't installed. Generate one at https://developer.apple.com/account/resources/certificates/list → `+` → Developer ID Application → follow the CSR flow. Download the resulting `.cer`, double-click to import. Re-run `security find-identity`.

### 0.2 Generate an app-specific password for notarization

1. Open https://appleid.apple.com → sign in with `greg.herriott@outlook.com` (or whichever Apple ID owns the developer account).
2. Sign-in & Security → App-Specific Passwords → `+`.
3. Label it `Claude Usage Dashboard notarization`.
4. Save the generated password (looks like `abcd-efgh-ijkl-mnop`) to 1Password under that label. You'll paste it into a shell env var in Stage 1 and a GitHub secret in Stage 4.

### 0.3 Note your Team ID

The Team ID is the 10-char code at https://developer.apple.com/account → Membership Details (or the part in parens at the end of your signing identity from step 0.1). Save it.

### 0.4 Quick sanity: M1 unsigned build still works

```bash
cd /Volumes/1tbSSD/claude-usage-dashboard
npm run tauri:build:unsigned
```

Should finish in ~80s and produce an unsigned `.app` + `.dmg` (Gatekeeper warning on first open is expected for unsigned). If this fails, fix M1 issues before continuing — Stage 1 can't work if M1 doesn't.

---

## Stage 1 — Local signed + notarized DMG (M2.4)

Goal: prove the signing + notarization pipeline works on your local Mac before involving CI.

### 1.1 Set the four env vars in your shell

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Greg Herriott (YOUR_TEAM_ID)"
export APPLE_ID="greg.herriott@outlook.com"
export APPLE_PASSWORD="<app-specific-password-from-0.2>"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
```

Replace the placeholders with the real values. These need to be in the SAME shell where you run `npm run tauri:build`.

### 1.2 Run the signed build

```bash
cd /Volumes/1tbSSD/claude-usage-dashboard
npm run tauri:build
```

Pipeline (verbose, takes 5–30 minutes — notarization is the slow step):
1. `npm run build` — compile server + web
2. `npm run prepare:sidecar` — Node 20 binary into `src-tauri/binaries/`
3. `npm run prepare:server-deps` — prod deps + native modules for Node 20 ABI
4. `bash scripts/sign-native-addons.sh` — codesign every `.node` with hardened runtime + entitlements (fails fast if `APPLE_SIGNING_IDENTITY` not set)
5. `tauri build --target aarch64-apple-darwin`:
   - Bundles `.app`
   - Signs `.app` with your Developer ID + entitlements + hardened runtime
   - Builds `.dmg`
   - Signs `.dmg`
   - Submits `.dmg` to Apple notarytool (waits for `status: Accepted`)
   - Staples the notarization ticket onto the `.dmg`

Watch for the final line:
```
Built dmg at: src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Claude Usage Dashboard_0.1.0_aarch64.dmg
```

**If notarytool rejects:**
- Run `xcrun notarytool log <submission-id> --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_PASSWORD"` to see what failed.
- Most common cause: a `.node` addon wasn't signed. Check `server-bundle/node_modules/**/*.node` with `codesign -dv` and re-run `bash scripts/sign-native-addons.sh` if any are unsigned.
- Second most common: app-specific password is wrong or expired.

### 1.3 Verify signing + notarization

```bash
APP="src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Claude Usage Dashboard.app"
DMG=$(ls src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg)
codesign --verify --deep --strict --verbose=2 "$APP"
spctl --assess --verbose --type execute "$APP"
xcrun stapler validate "$DMG"
```

Required outputs:
- `codesign --verify`: `Claude Usage Dashboard.app: valid on disk` + `satisfies its Designated Requirement`
- `spctl --assess`: `accepted` and `source=Notarized Developer ID`
- `stapler validate`: `The validate action worked!`

If `spctl` says `source=Developer ID` without `Notarized`, the notarization didn't complete or wasn't stapled — re-check Step 1.2's output.

### 1.4 Install + test on a fresh user account (cleanest UX check)

Either:
- Copy the `.dmg` to a second Mac
- OR create a fresh user account on your Mac (System Settings → Users & Groups → Add User), log in as that user, copy `.dmg` to their Downloads, open

Expected UX: ONE prompt — *"Claude Usage Dashboard is an app downloaded from the Internet. Are you sure you want to open it?"* — click Open. App runs. **No "unidentified developer" warning, no Gatekeeper block.**

### 1.5 Done with Stage 1

You've proven the signing pipeline works end-to-end locally. Don't push or commit anything from this stage — it's verification only.

---

## Stage 2 — Generate updater keypair (M3.1)

Goal: the Ed25519 keypair Tauri uses to verify update payloads.

### 2.1 Generate the keypair

```bash
mkdir -p ~/.tauri
npm --prefix /Volumes/1tbSSD/claude-usage-dashboard run tauri signer generate -- -w ~/.tauri/cud-updater.key
```

You'll be prompted for a password — set a strong one and save it to 1Password under **"CUD Updater Signing Key Password"**.

Output:
- `~/.tauri/cud-updater.key` — private key (KEEP SAFE)
- `~/.tauri/cud-updater.key.pub` — public key

### 2.2 Back up the private key to 1Password

```bash
cat ~/.tauri/cud-updater.key
```

Copy the entire contents (looks like `dW50cnVzdGVk...` — a long base64 blob). Save as a **Secure Note** in 1Password labeled **"CUD Updater Signing Key (Private)"**.

⚠️ **Losing this key permanently breaks the upgrade path on every installed app** — they verify updates against the corresponding pubkey baked into the `.app` and can't be migrated to a new key without a manual reinstall by every user. Treat it like a master release-signing key.

### 2.3 Read the public key

```bash
cat ~/.tauri/cud-updater.key.pub
```

Copy the entire string. You'll paste it into `tauri.conf.json` in the next step.

### 2.4 Replace the placeholder pubkey in `tauri.conf.json`

Open `src-tauri/tauri.conf.json` in the worktree. Find:

```json
"plugins": {
  "updater": {
    "active": true,
    "pubkey": "REPLACE_ME_WITH_REAL_PUBKEY_FROM_TAURI_SIGNER_GENERATE",
    ...
```

Replace `REPLACE_ME_WITH_REAL_PUBKEY_FROM_TAURI_SIGNER_GENERATE` with the full pubkey string from step 2.3.

Verify Tauri still parses the conf:
```bash
cd /Volumes/1tbSSD/claude-usage-dashboard
npx tauri info 2>&1 | head -20
```

Should run cleanly.

Commit:
```bash
git add src-tauri/tauri.conf.json
git commit -m "feat(updater): set Tauri updater public key"
```

---

## Stage 3 — Export Apple cert + base64 encode (for GitHub Actions)

Goal: get your Developer ID Application cert into a format you can store as a GitHub secret.

### 3.1 Export the cert as .p12

In Keychain Access (login keychain):
1. Find your `Developer ID Application: Greg Herriott (...)` certificate
2. Click the disclosure triangle to the left — there should be a private key beneath it. **Select BOTH the cert and the key** (cmd-click)
3. Right-click → Export 2 items → format: `Personal Information Exchange (.p12)`
4. Choose a strong password — save in 1Password as **"CUD Apple Cert P12 Password"**
5. Save as `~/cud-developer-id.p12`

### 3.2 Base64-encode it

```bash
base64 -i ~/cud-developer-id.p12 -o ~/cud-developer-id.p12.b64
cat ~/cud-developer-id.p12.b64 | pbcopy
```

The base64 string is now in your clipboard — ready to paste as a GitHub secret.

---

## Stage 4 — Configure GitHub Actions secrets (M3.5)

Goal: all 8 secrets configured so the release workflow can run.

Navigate to: https://github.com/Mudislandkid/claude-usage-dashboard/settings/secrets/actions

Click **New repository secret** for each:

| Name | Value | Source |
|---|---|---|
| `APPLE_CERTIFICATE_P12_BASE64` | (paste from clipboard — Stage 3.2) | Cert export |
| `APPLE_CERTIFICATE_PASSWORD` | (from 1Password: "CUD Apple Cert P12 Password") | Stage 3.1 |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Greg Herriott (YOUR_TEAM_ID)` | Stage 0.1 |
| `APPLE_ID` | `greg.herriott@outlook.com` | Stage 0.2 |
| `APPLE_PASSWORD` | (from 1Password: "Claude Usage Dashboard notarization") | Stage 0.2 |
| `APPLE_TEAM_ID` | (your 10-char team ID) | Stage 0.3 |
| `TAURI_SIGNING_PRIVATE_KEY` | (from 1Password: "CUD Updater Signing Key (Private)" — or `cat ~/.tauri/cud-updater.key`) | Stage 2.2 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | (from 1Password: "CUD Updater Signing Key Password") | Stage 2.1 |

### 4.1 Clean up local cert export

```bash
shred -u ~/cud-developer-id.p12.b64
# Optional — keep ~/cud-developer-id.p12 as a backup, or shred it if you trust the keychain copy:
# shred -u ~/cud-developer-id.p12
```

---

## Stage 5 — Ship v0.1.0 (M3.7)

Goal: first release through CI. (The Tauri work is already merged to main and pushed to origin as commit `c8679b1`.)

### 5.1 (Optional) Replace placeholder icon

If you have final 1024×1024 artwork:
```bash
cp /path/to/your/icon.png src-tauri/icons/icon.png
npx tauri icon src-tauri/icons/icon.png
git add src-tauri/icons/
git commit -m "feat(tauri): final app icon"
git push
```

Otherwise ship v0.1.0 with the placeholder; you can swap later.

### 5.2 Tag and push

```bash
git tag v0.1.0
git push origin v0.1.0
```

### 5.3 Watch the release workflow

https://github.com/Mudislandkid/claude-usage-dashboard/actions

The Release workflow should appear within seconds of the tag push. Total time: ~15–35 minutes (npm ci ~2m, Rust compile ~5m cold, notarization 5–20m).

If it fails, check the logs. Most common first-run issues:
- Cert import failed → `APPLE_CERTIFICATE_P12_BASE64` encoding is wrong (must be raw base64 with no line wrapping)
- Signing identity mismatch → `APPLE_SIGNING_IDENTITY` must be the EXACT string from `security find-identity` including the team ID in parens
- Notarization rejected → check the notarytool log link in the workflow output

### 5.4 Verify the release

Once green, visit https://github.com/Mudislandkid/claude-usage-dashboard/releases/tag/v0.1.0. Confirm assets:
- `Claude Usage Dashboard_0.1.0_aarch64.dmg`
- `Claude Usage Dashboard_0.1.0_aarch64.app.tar.gz`
- `Claude Usage Dashboard_0.1.0_aarch64.app.tar.gz.sig`
- `latest.json`

Download the `.dmg`, mount, drag the `.app` to `/Applications`, open. Should show only the standard "downloaded from Internet" prompt — click Open.

The app runs. 🎉

---

## Stage 6 — Ship v0.1.1 to validate the update path (M3.8)

Goal: confirm an installed v0.1.0 actually receives + applies an update.

### 6.1 Make a visible change

Something tiny and clearly visible so you can confirm the update applied. For example, edit `web/src/components/Header.tsx` (or wherever the title renders) to read `Claude Usage Dashboard v0.1.1`. Revert later or leave it as a release-marker.

### 6.2 Bump version in all five files

Versions must match exactly across:
- `package.json` (root) → `"version": "0.1.1"`
- `web/package.json` → `"version": "0.1.1"`
- `server/package.json` → `"version": "0.1.1"`
- `src-tauri/Cargo.toml` → `version = "0.1.1"`
- `src-tauri/tauri.conf.json` → `"version": "0.1.1"`

Tip: a one-liner to bump all five:
```bash
sed -i '' 's/"version": "0\.1\.0"/"version": "0.1.1"/' package.json web/package.json server/package.json src-tauri/tauri.conf.json
sed -i '' 's/^version = "0\.1\.0"$/version = "0.1.1"/' src-tauri/Cargo.toml
git diff -- package.json web/package.json server/package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml  # eyeball
```

### 6.3 Commit, tag, push

```bash
git add .
git commit -m "chore: bump version to 0.1.1"
git tag v0.1.1
git push && git push origin v0.1.1
```

### 6.4 Wait for the release to land

Same workflow as Stage 5.3 — ~15–35 minutes.

### 6.5 Open the v0.1.0 install you set up in Stage 5.4

Within ~3 seconds of launching v0.1.0, the updater fires. You should see a system confirm dialog:

> **An update is available: v0.1.1**
> Download and install now? The app will restart.

Click OK. The app:
1. Downloads `Claude Usage Dashboard_0.1.1_aarch64.app.tar.gz`
2. Verifies the Ed25519 signature against the pubkey baked into v0.1.0
3. Swaps the `.app` in place
4. Relaunches as v0.1.1

Verify the visible change from Stage 6.1 is present after relaunch.

🎉 You're done. From here, every future tag push ships a signed + notarized + auto-updating release.

---

## Ongoing release cycle

For all subsequent releases:

1. Bump version in the five files (Stage 6.2)
2. Commit, tag `vX.Y.Z`, push tag
3. Wait for CI
4. Installed users get prompted to upgrade within seconds of launching after the release lands

That's it. No re-running any of Stages 0–4 unless something changes (cert expires, you rotate the updater key, etc.).

---

## Troubleshooting reference

| Problem | Fix |
|---|---|
| Local signed build fails at notarization with "invalid entitlements" | Run `codesign -d --entitlements - <path>/Claude\ Usage\ Dashboard.app` and confirm it matches `src-tauri/entitlements.plist` — if not, the Tauri auto-sign path didn't apply our entitlements correctly. |
| `spctl --assess` says "source=Developer ID" without "Notarized" | Notarization didn't complete or wasn't stapled. Re-run the build; check notarytool log via `xcrun notarytool log <id>`. |
| CI release workflow fails at "Import Apple cert into temp keychain" | `APPLE_CERTIFICATE_P12_BASE64` was pasted with line wrapping. Re-encode with `base64 -i cert.p12 -o cert.p12.b64` and confirm it's a single long line. |
| Updater dialog never appears even though new release exists | Check that the pubkey in `src-tauri/tauri.conf.json` matches the one in `~/.tauri/cud-updater.key.pub`. Also check the app's network — it queries `github.com/.../releases/latest/download/latest.json`. |
| Installed app crashes on launch after update | `latest.json` may reference the wrong `.app.tar.gz` URL. Inspect the asset and re-publish if needed; existing installs will retry. |
| TS build fails with `Cannot find module '@tauri-apps/plugin-updater'` | Stale `tsbuildinfo` cache after branch switch or merge. Run `find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete && npm install` then retry. |

---

## File map (for reference)

What's in the repo as a result of M1+M2+M3:

```
src-tauri/                          Tauri Rust shell
├── Cargo.toml                       deps + libc + tauri-plugin-{shell,window-state,updater,process,opener}
├── tauri.conf.json                  identifier, bundle config, plugins.updater, externalBin, resources
├── entitlements.plist               hardened-runtime entitlements
├── rust-toolchain.toml              pinned stable + aarch64 target
├── capabilities/default.json        shell:allow-spawn, opener:allow-open-url, updater:default, process:allow-restart
├── icons/                           generated icon set (32x32.png, 128x128.png, 128x128@2x.png, icon.icns, .ico, mobile variants)
├── binaries/                        sidecar Node binary (gitignored)
├── server-bundle/                   build artifact — prod deps + dist + web (gitignored)
└── src/
    ├── main.rs                      thin shim → lib::run()
    ├── lib.rs                       Tauri builder, plugins, sidecar setup, menu, lifecycle
    ├── sidecar.rs                   spawn Node sidecar, parse READY <port>, kill on quit
    └── menu.rs                      native macOS menu bar

scripts/
├── prepare-sidecar.mjs              downloads Node 20 arm64 → src-tauri/binaries/
├── prepare-server-deps.mjs          materializes prod deps + fsevents into src-tauri/server-bundle/
└── sign-native-addons.sh            codesigns every .node under server-bundle/ (gated by APPLE_SIGNING_IDENTITY)

.github/workflows/
├── ci.yml                           typecheck + tests + unsigned smoke build on PRs
└── release.yml                      on v*.*.* tag: sign + notarize + GitHub release

server/src/
├── config.ts                        PORT defaults to 0 when CUD_BUNDLED=1
└── index.ts                         emits READY <port>; serves web build via @fastify/static when bundled

web/src/
├── lib/updater.ts                   checkForUpdates() — no-op in browser, native dialog in Tauri
└── main.tsx                         calls checkForUpdates() 3s after mount

package.json scripts:
- tauri:dev                          tauri dev --target aarch64-apple-darwin
- tauri:build:unsigned               build + prep + tauri build (no signing)
- tauri:build                        build + prep + sign-addons + tauri build (signed, requires env vars)
- prepare:sidecar / prepare:server-deps    individual prep steps
```
