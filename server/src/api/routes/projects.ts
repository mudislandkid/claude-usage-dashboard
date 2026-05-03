import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { listProjects, projectDetail } from '../../db/queries/projects.js';
import { getSettings } from '../../db/queries/settings.js';

const ParamsSchema = z.object({ id: z.string().min(1) });

export async function projectsRoutes(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/projects', async () => {
    const settings = getSettings(opts.ctx.db);
    return { projects: listProjects(opts.ctx.db, settings.activeWithinDays) };
  });

  app.get('/projects/:id', async (req) => {
    const { id } = ParamsSchema.parse(req.params);
    return projectDetail(opts.ctx.db, decodeURIComponent(id));
  });
}
