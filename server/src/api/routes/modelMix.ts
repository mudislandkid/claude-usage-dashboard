import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { modelMixByProject } from '../../db/queries/modelMix.js';

const Q = z.object({ days: z.coerce.number().min(0.1).max(365).default(30) });

export async function modelMixRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/model-mix', async (req) => {
    const { days } = Q.parse(req.query);
    return { days, rows: modelMixByProject(opts.ctx.db, days) };
  });
}
