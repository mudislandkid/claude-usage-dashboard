import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { costBreakdown } from '../../db/queries/costBreakdown.js';

const Q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export async function costBreakdownRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/cost-breakdown', async (req) => {
    const { days } = Q.parse(req.query);
    return costBreakdown(opts.ctx.db, days);
  });
}
