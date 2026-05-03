import { openDb } from './db/connection.js';
import { buildApi } from './api/server.js';
import { scanAll } from './scanner/scanner.js';
import { createWatcher } from './watcher/watcher.js';
import { DB_PATH, PROJECTS_DIR, PORT, HOST } from './config.js';

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
  await app.listen({ port: PORT, host: HOST });
  console.log(`[boot] Listening on http://${HOST}:${PORT}`);

  process.on('SIGTERM', async () => {
    await watcher.stop();
    await app.close();
    db.close();
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
