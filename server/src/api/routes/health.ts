import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { ApiContext } from '../server.js';

export async function healthRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/health', async () => {
    const r = opts.ctx.db.prepare(`SELECT COUNT(*) AS n FROM files`).get() as { n: number };
    const last = opts.ctx.db
      .prepare(`SELECT MAX(last_scanned_at) AS last FROM files`)
      .get() as { last: string | null };
    return { ok: true, filesIndexed: r.n, lastScanAt: last.last };
  });
}
