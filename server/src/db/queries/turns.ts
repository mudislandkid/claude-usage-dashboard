import type { DB } from '../connection.js';
import type { Turn } from '../../types.js';

export function insertTurn(db: DB, t: Turn): void {
  db.prepare(
    `INSERT OR IGNORE INTO turns
      (session_id, message_id, ts, model, input_tokens, output_tokens,
       cache_read_tokens, cache_creation_tokens, cache_creation_5m,
       cache_creation_1h, service_tier, is_subagent, iterations_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    t.sessionId,
    t.messageId,
    t.ts,
    t.model,
    t.inputTokens,
    t.outputTokens,
    t.cacheReadTokens,
    t.cacheCreationTokens,
    t.cacheCreation5m,
    t.cacheCreation1h,
    t.serviceTier,
    t.isSubagent ? 1 : 0,
    t.iterationsCount,
  );
}

export function turnsForSession(db: DB, sessionId: string): Turn[] {
  const rows = db
    .prepare(`SELECT * FROM turns WHERE session_id = ? ORDER BY ts ASC`)
    .all(sessionId) as Array<Record<string, unknown>>;
  return rows.map(rowToTurn);
}

function rowToTurn(r: Record<string, unknown>): Turn {
  return {
    sessionId: r.session_id as string,
    messageId: (r.message_id as string) ?? null,
    ts: r.ts as string,
    model: r.model as string,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cacheReadTokens: r.cache_read_tokens as number,
    cacheCreationTokens: r.cache_creation_tokens as number,
    cacheCreation5m: r.cache_creation_5m as number,
    cacheCreation1h: r.cache_creation_1h as number,
    serviceTier: (r.service_tier as string) ?? null,
    isSubagent: r.is_subagent === 1,
    iterationsCount: (r.iterations_count as number) ?? 1,
  };
}
