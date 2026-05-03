import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { turnsForSession } from '../../db/queries/turns.js';

const ParamsSchema = z.object({ id: z.string().min(1) });

export async function sessionRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/sessions/:id', async (req) => {
    const { id } = ParamsSchema.parse(req.params);
    const session = opts.ctx.db
      .prepare(`SELECT * FROM sessions WHERE session_id = ?`)
      .get(id);
    const subagents = opts.ctx.db
      .prepare(
        `SELECT session_id, primary_model, first_ts, last_ts, turn_count
         FROM sessions WHERE parent_session_id = ?`,
      )
      .all(id);
    const turns = turnsForSession(opts.ctx.db, id);
    return { session, subagents, turns };
  });
}
