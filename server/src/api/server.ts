import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { DB } from '../db/connection.js';
import { healthRoute } from './routes/health.js';
import { windowRoute } from './routes/window.js';
import { weeklyRoute } from './routes/weekly.js';
import { peakWindowRoute } from './routes/peakWindow.js';
import { projectsRoutes } from './routes/projects.js';
import { sessionRoute } from './routes/sessions.js';
import { heatmapRoute } from './routes/heatmap.js';
import { cacheRoutes } from './routes/cache.js';
import { modelMixRoute } from './routes/modelMix.js';
import { settingsRoutes } from './routes/settings.js';
import { scanRoute } from './routes/scan.js';
import { insightsRoutes } from './routes/insights.js';
import { costBreakdownRoute } from './routes/costBreakdown.js';
import { pathAliasesRoutes } from './routes/pathAliases.js';

export interface ApiContext {
  db: DB;
  triggerScan: () => Promise<void>;
}

export async function buildApi(ctx: ApiContext): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: 'info' } });
  await app.register(cors, { origin: true });
  app.register(healthRoute, { prefix: '/api', ctx });
  app.register(windowRoute, { prefix: '/api', ctx });
  app.register(weeklyRoute, { prefix: '/api', ctx });
  app.register(peakWindowRoute, { prefix: '/api', ctx });
  app.register(projectsRoutes, { prefix: '/api', ctx });
  app.register(sessionRoute, { prefix: '/api', ctx });
  app.register(heatmapRoute, { prefix: '/api', ctx });
  app.register(cacheRoutes, { prefix: '/api', ctx });
  app.register(modelMixRoute, { prefix: '/api', ctx });
  app.register(settingsRoutes, { prefix: '/api', ctx });
  app.register(scanRoute, { prefix: '/api', ctx });
  app.register(insightsRoutes, { prefix: '/api', ctx });
  app.register(costBreakdownRoute, { prefix: '/api', ctx });
  app.register(pathAliasesRoutes, { prefix: '/api', ctx });
  return app;
}
