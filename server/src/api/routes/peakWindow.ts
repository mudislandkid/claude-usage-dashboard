import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { peakWindow } from '../../db/queries/window.js';

const Q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export async function peakWindowRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/peak-window', async (req) => {
    const { days } = Q.parse(req.query);
    return peakWindow(opts.ctx.db, days);
  });
}
