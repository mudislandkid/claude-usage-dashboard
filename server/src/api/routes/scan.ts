import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { ApiContext } from '../server.js';

export async function scanRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.post('/scan', async () => {
    await opts.ctx.triggerScan();
    return { ok: true };
  });
}
