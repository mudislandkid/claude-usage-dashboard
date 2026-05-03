import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { heatmap } from '../../db/queries/heatmap.js';

const Q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export async function heatmapRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/heatmap', async (req) => {
    const { days } = Q.parse(req.query);
    return { days, cells: heatmap(opts.ctx.db, days) };
  });
}
