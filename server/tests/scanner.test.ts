import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db/connection.js';
import { scanAll } from '../src/scanner/scanner.js';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cud-'));
}

const SAMPLE = `{"type":"assistant","timestamp":"2026-04-21T08:10:07.707Z","sessionId":"s-1","cwd":"/p/test","entrypoint":"claude-vscode","version":"2.1.116","gitBranch":"main","message":{"id":"m1","model":"claude-opus-4-7","role":"assistant","usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":100,"cache_creation_input_tokens":50,"cache_creation":{"ephemeral_5m_input_tokens":50,"ephemeral_1h_input_tokens":0}}}}\n`;

describe('scanAll', () => {
  it('scans a sample file and inserts session + turn rows', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 's-1.jsonl'), SAMPLE);
    const db = openDb(':memory:');
    const r = await scanAll(db, dir);
    expect(r.turnsInserted).toBe(1);
    const sessions = db.prepare(`SELECT * FROM sessions`).all();
    expect(sessions.length).toBe(1);
  });

  it('is incremental — re-running scans nothing new', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 's-1.jsonl'), SAMPLE);
    const db = openDb(':memory:');
    await scanAll(db, dir);
    const r2 = await scanAll(db, dir);
    expect(r2.turnsInserted).toBe(0);
    expect(r2.filesSkipped).toBe(1);
  });

  it('detects subagent files via path', async () => {
    const dir = tmp();
    const parentId = 'cb3d732a-77fa-4419-a852-c1800c066dea';
    const sub = path.join(dir, parentId, 'subagents');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'agent-xxx.jsonl'), SAMPLE.replace('"s-1"', '"sub-1"'));
    const db = openDb(':memory:');
    await scanAll(db, dir);
    const subRow = db
      .prepare(`SELECT is_subagent, parent_session_id FROM sessions WHERE session_id = ?`)
      .get('sub-1') as { is_subagent: number; parent_session_id: string };
    expect(subRow.is_subagent).toBe(1);
    expect(subRow.parent_session_id).toBe(parentId);
  });
});
