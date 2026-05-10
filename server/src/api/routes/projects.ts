import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { listProjects, projectDetail } from '../../db/queries/projects.js';
import {
  projectHeader,
  projectCacheStats,
  projectModelMix,
  projectActivity,
  projectSubagentStats,
  projectCacheTtl,
  projectTopSessions,
  projectEntrypoints,
  projectModelMixOverTime,
  projectCacheOverTime,
} from '../../db/queries/projectDetail.js';
import { toolUseForProject } from '../../db/queries/toolCalls.js';
import { gitStats } from '../../git/gitStats.js';
import { getSettings } from '../../db/queries/settings.js';

const ParamsSchema = z.object({ id: z.string().min(1) });
const Q = z.object({ days: z.coerce.number().min(0.1).max(365).default(30) });

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
    const { days } = Q.parse(req.query);
    const path = decodeURIComponent(id);
    const db = opts.ctx.db;
    const header = projectHeader(db, path);
    if (!header) {
      return {
        header: null,
        days,
        cache: null,
        modelMix: null,
        activity: [],
        subagent: null,
        cacheTtl: null,
        topSessions: [],
        entrypoints: [],
        modelMixOverTime: [],
        cacheOverTime: [],
        sessions: projectDetail(db, path).sessions,
      };
    }
    return {
      header,
      days,
      cache: projectCacheStats(db, path, days),
      modelMix: projectModelMix(db, path, days),
      activity: projectActivity(db, path, days),
      subagent: projectSubagentStats(db, path, days),
      cacheTtl: projectCacheTtl(db, path, days),
      topSessions: projectTopSessions(db, path, 10),
      entrypoints: projectEntrypoints(db, path),
      modelMixOverTime: projectModelMixOverTime(db, path, days),
      cacheOverTime: projectCacheOverTime(db, path, days),
      toolUse: toolUseForProject(db, path, days),
      git: gitStats(path, days),
      sessions: projectDetail(db, path).sessions,
    };
  });
}
