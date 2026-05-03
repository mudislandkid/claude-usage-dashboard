import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import {
  entrypointsGlobal,
  worstCacheSessions,
  cacheByHourOfDay,
  forecastNext24h,
} from '../../db/queries/insights.js';
import {
  toolUseGlobal,
  compactionByProject,
  modelRecommendations,
} from '../../db/queries/toolCalls.js';

const Q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export async function insightsRoutes(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/entrypoints', async () => ({ entrypoints: entrypointsGlobal(opts.ctx.db) }));

  app.get('/worst-cache-sessions', async (req) => {
    const { days } = Q.parse(req.query);
    return { days, sessions: worstCacheSessions(opts.ctx.db, days) };
  });

  app.get('/cache-by-hour', async (req) => {
    const { days } = Q.parse(req.query);
    return { days, hours: cacheByHourOfDay(opts.ctx.db, days) };
  });

  app.get('/forecast', async (req) => {
    const { days } = Q.parse(req.query);
    return forecastNext24h(opts.ctx.db, days);
  });

  app.get('/tool-use', async (req) => {
    const { days } = Q.parse(req.query);
    return { days, tools: toolUseGlobal(opts.ctx.db, days) };
  });

  app.get('/compaction', async (req) => {
    const { days } = Q.parse(req.query);
    return { days, projects: compactionByProject(opts.ctx.db, days) };
  });

  app.get('/model-recommendations', async (req) => {
    const { days } = Q.parse(req.query);
    return { days, recommendations: modelRecommendations(opts.ctx.db, days) };
  });
}
