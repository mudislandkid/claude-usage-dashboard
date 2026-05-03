import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { overallCacheScore, cacheScoreByProject } from '../../db/queries/cache.js';
import { getSettings } from '../../db/queries/settings.js';

const Q = z.object({ days: z.coerce.number().int().min(1).max(365).optional() });

export async function cacheRoutes(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/cache-effectiveness', async (req) => {
    const settings = getSettings(opts.ctx.db);
    const { days } = Q.parse(req.query);
    const d = days ?? settings.cacheScoreWindowDays;
    return {
      days: d,
      overall: overallCacheScore(opts.ctx.db, d),
      byProject: cacheScoreByProject(opts.ctx.db, d),
    };
  });
}
