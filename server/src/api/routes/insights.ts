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
import {
  ttlLeakageGlobal,
  ttlLeakageByProject,
  versionAdoption,
} from '../../db/queries/heavy.js';
import { cacheTtlEfficiency } from '../../db/queries/cacheTtl.js';
import {
  forecastForDay,
  todayLocalDate,
  addDaysIso,
} from '../../db/queries/forecastDay.js';

const Q = z.object({ days: z.coerce.number().min(0.1).max(365).default(30) });

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

  const DayQ = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    days: z.coerce.number().min(1).max(365).default(30),
  });

  app.get('/forecast/day', async (req, reply) => {
    const parsed = DayQ.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid query parameters' });
    }
    const today = todayLocalDate();
    const date = parsed.data.date ?? today;
    const minDate = addDaysIso(today, -7);
    const maxDate = addDaysIso(today, 1);
    if (date < minDate || date > maxDate) {
      return reply.code(400).send({ error: 'date out of range' });
    }
    return forecastForDay(opts.ctx.db, date, parsed.data.days);
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

  app.get('/ttl-leakage', async (req) => {
    const { days } = Q.parse(req.query);
    return {
      days,
      overall: ttlLeakageGlobal(opts.ctx.db, days),
      byProject: ttlLeakageByProject(opts.ctx.db, days),
    };
  });

  app.get('/version-adoption', async () => {
    return { versions: versionAdoption(opts.ctx.db) };
  });

  app.get('/cache-ttl-efficiency', async (req) => {
    const { days } = Q.parse(req.query);
    return cacheTtlEfficiency(opts.ctx.db, days);
  });
}
