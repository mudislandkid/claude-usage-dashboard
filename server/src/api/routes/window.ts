import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { ApiContext } from '../server.js';
import { fiveHourWindow } from '../../db/queries/window.js';
import { getSettings } from '../../db/queries/settings.js';

export async function windowRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/window', async () => {
    const w = fiveHourWindow(opts.ctx.db);
    const settings = getSettings(opts.ctx.db);
    const limit = settings.windowLimitTokens;
    const used = w.totalChargeable;
    const pct = Math.min(1, used / limit);
    const minsToLimit =
      w.burnRatePerMin > 0 ? Math.max(0, (limit - used) / w.burnRatePerMin) : null;
    return { ...w, limitTokens: limit, percentUsed: pct, minutesToLimit: minsToLimit };
  });
}
