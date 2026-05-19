import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import {
  deleteAlias,
  distinctProjectPaths,
  listAliases,
  upsertAlias,
} from '../../db/queries/pathAliases.js';
import { canonicalizePath } from '../../lib/pathAliases.js';

const Body = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
const DeleteQ = z.object({ from: z.string().min(1) });

export async function pathAliasesRoutes(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/aliases', async () => ({ aliases: listAliases(opts.ctx.db) }));

  app.post('/aliases', async (req, reply) => {
    const { from, to } = Body.parse(req.body);
    if (from === to) {
      reply.code(400);
      return { error: 'from and to must differ' };
    }
    // Guard against trivial cycles: collapsing `to` through existing aliases
    // must not resolve back to `from`.
    const existing = listAliases(opts.ctx.db);
    const resolvedTo = canonicalizePath(to, existing);
    if (resolvedTo === from) {
      reply.code(400);
      return { error: 'alias would create a cycle' };
    }
    upsertAlias(opts.ctx.db, from, to);
    return { ok: true };
  });

  app.delete('/aliases', async (req) => {
    const { from } = DeleteQ.parse(req.query);
    deleteAlias(opts.ctx.db, from);
    return { ok: true };
  });

  // Convenience: distinct project paths in the DB (used by the UI to populate dropdowns).
  app.get('/aliases/candidates', async () => ({
    paths: distinctProjectPaths(opts.ctx.db),
  }));
}
