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
    // Resolve the React build relative to this file. Layouts we handle:
    //   1. Bundled (server-bundle layout): server-bundle/dist/index.js
    //      -> server-bundle/web-dist
    //   2. Legacy bundled (Resources/dist sibling layout) — kept for safety
    //   3. Local build: server/dist/index.js -> repo-root/web/dist
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(here, '..', 'web-dist'),
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

  await app.listen({ port: PORT, host: HOST });
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
