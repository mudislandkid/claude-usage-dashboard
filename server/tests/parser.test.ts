import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLine } from '../src/scanner/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fix = (n: string) =>
  readFileSync(path.join(__dirname, 'fixtures', n), 'utf8').split('\n').filter(Boolean);

describe('parseLine', () => {
  it('parses a normal assistant turn', () => {
    const [line] = fix('normal-turn.jsonl');
    const { turn, meta } = parseLine(line!, { isSubagentFile: false });
    expect(turn).not.toBeNull();
    expect(turn?.sessionId).toBe('s-abc');
    expect(turn?.cacheCreation1h).toBe(36323);
    expect(turn?.isSubagent).toBe(false);
    expect(meta.entrypoint).toBe('claude-vscode');
  });

  it('marks subagent when isSidechain or path indicates', () => {
    const [line] = fix('subagent-turn.jsonl');
    const r = parseLine(line!, { isSubagentFile: false });
    expect(r.turn?.isSubagent).toBe(true);
  });

  it('returns null turn for malformed/non-assistant rows but never throws', () => {
    const lines = fix('malformed.jsonl');
    for (const line of lines) {
      expect(() => parseLine(line, { isSubagentFile: false })).not.toThrow();
      expect(parseLine(line, { isSubagentFile: false }).turn).toBeNull();
    }
  });
});
