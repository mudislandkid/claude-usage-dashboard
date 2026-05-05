import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { getSettings, updateSettings } from '../../db/queries/settings.js';

const Body = z.object({
  windowLimitTokens: z.number().int().positive().optional(),
  activeWithinDays: z.number().int().positive().optional(),
  cacheScoreWindowDays: z.number().int().positive().optional(),
  oauthUsageEnabled: z.boolean().optional(),
});

export async function settingsRoutes(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/settings', async () => getSettings(opts.ctx.db));
  app.post('/settings', async (req) => {
    const partial = Body.parse(req.body);
    return updateSettings(opts.ctx.db, partial);
  });
}
