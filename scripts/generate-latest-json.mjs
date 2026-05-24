#!/usr/bin/env node
// Generates the Tauri updater manifest (latest.json) from the freshly-built
// .app.tar.gz.sig signature file. The manifest is what installed apps fetch
// from `https://github.com/<repo>/releases/latest/download/latest.json` to
// discover newer versions.
//
// Inputs:
//   - Tauri's build output at src-tauri/target/aarch64-apple-darwin/release/bundle/macos/
//   - Root package.json for version
//   - REPO_SLUG env (e.g. "Mudislandkid/claude-usage-dashboard") or auto-detected from git remote
//
// Output: <bundle/macos>/latest.json

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const BUNDLE_DIR = join(
  REPO_ROOT,
  'src-tauri',
  'target',
  'aarch64-apple-darwin',
  'release',
  'bundle',
  'macos',
);

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
if (!version) throw new Error('No version in root package.json');

// GitHub renames spaces to dots in release asset URLs.
const APP_TAR_GZ = 'Claude Usage Dashboard.app.tar.gz';
const APP_TAR_GZ_SIG = `${APP_TAR_GZ}.sig`;
const ASSET_URL_NAME = APP_TAR_GZ.replaceAll(' ', '.');

const sigPath = join(BUNDLE_DIR, APP_TAR_GZ_SIG);
if (!existsSync(sigPath)) {
  console.error(`[latest.json] Signature not found at ${sigPath}`);
  console.error('[latest.json] Run `npm run tauri:build` first so Tauri produces the .sig.');
  process.exit(1);
}
const signature = readFileSync(sigPath, 'utf8').trim();

const repoSlug = process.env.REPO_SLUG || detectRepoSlug();
const url = `https://github.com/${repoSlug}/releases/download/v${version}/${ASSET_URL_NAME}`;

const manifest = {
  version,
  notes: 'See release notes on GitHub.',
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': { signature, url },
  },
};

const out = join(BUNDLE_DIR, 'latest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`[latest.json] Wrote ${out}`);
console.log(`[latest.json] version=${version} url=${url}`);

function detectRepoSlug() {
  try {
    const remote = execSync('git config --get remote.origin.url', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    // Handles both https://github.com/owner/repo(.git) and git@github.com:owner/repo(.git)
    const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/);
    if (!m) throw new Error(`Cannot parse remote: ${remote}`);
    return `${m[1]}/${m[2]}`;
  } catch (e) {
    throw new Error(`REPO_SLUG not set and auto-detect failed: ${e.message}`);
  }
}
