#!/usr/bin/env node
// Builds src-tauri/server-bundle/ — an isolated, production-only copy of the
// server with native modules compiled for the bundled Node 20 runtime
// (cud-server-aarch64-apple-darwin) shipped with the Tauri app.
//
// Why: the repo uses npm workspaces, which hoists every dep to the root
// node_modules. The Tauri bundler glob `../server/node_modules/**/*` therefore
// matches nothing. We need a self-contained tree, and the prebuilt .node files
// for better-sqlite3 / fsevents must match Node 20's NODE_MODULE_VERSION (115)
// rather than the host's Node 25 (NMV 137). The npm_config_target* env vars
// instruct prebuild-install to fetch the correct ABI prebuilds even when the
// install itself runs under host Node.

import { existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SERVER_SRC = join(REPO, 'server');
const SERVER_DIST = join(SERVER_SRC, 'dist');
const SERVER_PKG = join(SERVER_SRC, 'package.json');
const WEB_DIST = join(REPO, 'web', 'dist');
const BUNDLE_DIR = join(REPO, 'src-tauri', 'server-bundle');

function run(cmd, args, opts = {}) {
  console.log(`[prepare-server-deps] ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed (exit ${r.status})`);
}

if (!existsSync(SERVER_DIST)) {
  throw new Error(`Missing ${SERVER_DIST} — run \`npm run build -w server\` first.`);
}
if (!existsSync(WEB_DIST)) {
  throw new Error(`Missing ${WEB_DIST} — run \`npm run build -w web\` first.`);
}

if (existsSync(BUNDLE_DIR)) {
  console.log(`[prepare-server-deps] Cleaning ${BUNDLE_DIR}`);
  rmSync(BUNDLE_DIR, { recursive: true });
}
mkdirSync(BUNDLE_DIR, { recursive: true });

console.log(`[prepare-server-deps] Copying server package.json + dist + web-dist`);
cpSync(SERVER_PKG, join(BUNDLE_DIR, 'package.json'));
cpSync(SERVER_DIST, join(BUNDLE_DIR, 'dist'), { recursive: true });
cpSync(WEB_DIST, join(BUNDLE_DIR, 'web-dist'), { recursive: true });

// Production install with Node-20 ABI targeting for native prebuilds.
const env = {
  ...process.env,
  npm_config_target: '20.18.1',
  npm_config_target_arch: 'arm64',
  npm_config_target_platform: 'darwin',
  npm_config_runtime: 'node',
  npm_config_disturl: 'https://nodejs.org/dist',
};

run(
  'npm',
  [
    'install',
    '--omit=dev',
    '--include=optional',
    '--no-package-lock',
    '--workspaces=false',
    '--install-strategy=nested',
  ],
  { cwd: BUNDLE_DIR, env },
);

// fsevents is chokidar's optional dep (darwin-only). With
// --install-strategy=nested + --no-package-lock + --workspaces=false, npm
// reliably drops fsevents on the floor even with --include=optional. Since
// fsevents 2.x ships a prebuilt N-API .node (ABI-stable across Node 18/20/22+)
// directly in its tarball, we can safely copy the resolved copy from the
// hoisted root node_modules into the bundle.
const rootFsevents = join(REPO, 'node_modules', 'fsevents');
const targetFsevents = join(BUNDLE_DIR, 'node_modules', 'fsevents');
if (existsSync(rootFsevents) && !existsSync(targetFsevents)) {
  cpSync(rootFsevents, targetFsevents, { recursive: true });
  console.log(`[prepare-server-deps] Copied fsevents from ${rootFsevents}`);
} else if (!existsSync(rootFsevents)) {
  console.warn(
    '[prepare-server-deps] WARNING: root node_modules/fsevents missing — ' +
      'run `npm install` at repo root first for native macOS file events.',
  );
}

// Verify native binaries are arm64 + present.
const nativeChecks = [
  join(BUNDLE_DIR, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
  join(BUNDLE_DIR, 'node_modules', 'fsevents', 'fsevents.node'),
];
for (const p of nativeChecks) {
  if (existsSync(p)) {
    console.log(`[prepare-server-deps] Checking ${p}`);
    run('file', [p]);
  } else {
    console.warn(`[prepare-server-deps] WARNING: native binary not found at ${p}`);
  }
}

console.log('[prepare-server-deps] Done.');
