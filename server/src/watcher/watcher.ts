import chokidar, { type FSWatcher } from 'chokidar';
import type { DB } from '../db/connection.js';
import { scanAll } from '../scanner/scanner.js';

export interface Watcher {
  start(): void;
  stop(): Promise<void>;
}

export function createWatcher(db: DB, projectsDir: string): Watcher {
  let watcher: FSWatcher | null = null;
  let scheduled: NodeJS.Timeout | null = null;
  let running = false;

  function trigger() {
    if (scheduled || running) return;
    scheduled = setTimeout(async () => {
      scheduled = null;
      running = true;
      try {
        const r = await scanAll(db, projectsDir);
        if (r.filesScanned > 0) {
          console.log(`[watcher] scanned ${r.filesScanned} files, +${r.turnsInserted} turns`);
        }
      } finally {
        running = false;
      }
    }, 1500);
  }

  return {
    start() {
      watcher = chokidar.watch(`${projectsDir}/**/*.jsonl`, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      });
      watcher.on('add', trigger).on('change', trigger);
    },
    async stop() {
      if (scheduled) clearTimeout(scheduled);
      await watcher?.close();
    },
  };
}
