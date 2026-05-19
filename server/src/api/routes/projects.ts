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
import {
  distinctProjectPaths,
  listAliases,
} from '../../db/queries/pathAliases.js';
import { canonicalizePath, expandCanonical } from '../../lib/pathAliases.js';

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
    const rawInput = decodeURIComponent(id);
    const db = opts.ctx.db;

    // Resolve the input through aliases so old (now-aliased-away) links still work.
    const aliases = listAliases(db);
    const canonical = canonicalizePath(rawInput, aliases);

    // Expand canonical to every raw path actually present in the DB.
    const paths = expandCanonical(canonical, distinctProjectPaths(db), aliases);

    const header = projectHeader(db, canonical, paths);
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
        sessions: projectDetail(db, paths).sessions,
      };
    }
    return {
      header,
      days,
      cache: projectCacheStats(db, paths, days),
      modelMix: projectModelMix(db, paths, days),
      activity: projectActivity(db, paths, days),
      subagent: projectSubagentStats(db, paths, days),
      cacheTtl: projectCacheTtl(db, paths, days),
      topSessions: projectTopSessions(db, paths, 10),
      entrypoints: projectEntrypoints(db, paths),
      modelMixOverTime: projectModelMixOverTime(db, paths, days),
      cacheOverTime: projectCacheOverTime(db, paths, days),
      toolUse: toolUseForProject(db, paths, days),
      // gitStats reads from the filesystem — only meaningful for the canonical path itself.
      git: gitStats(canonical, days),
      sessions: projectDetail(db, paths).sessions,
    };
  });
}
