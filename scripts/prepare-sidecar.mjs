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
