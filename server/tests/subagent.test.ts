import { describe, it, expect } from 'vitest';
import {
  isSubagentFile,
  parentSessionFromPath,
  topLevelSessionId,
} from '../src/scanner/subagent.js';

describe('subagent helpers', () => {
  it('detects subagent path', () => {
    expect(isSubagentFile('/p/abc/subagents/agent-xyz.jsonl')).toBe(true);
    expect(isSubagentFile('/p/abc.jsonl')).toBe(false);
  });

  it('extracts parent session id', () => {
    const fp =
      '/Users/g/.claude/projects/-V-x/cb3d732a-77fa-4419-a852-c1800c066dea/subagents/agent-ad333bc68401d18a6.jsonl';
    expect(parentSessionFromPath(fp)).toBe('cb3d732a-77fa-4419-a852-c1800c066dea');
  });

  it('extracts top-level session id', () => {
    expect(topLevelSessionId('/p/3d86b708-31fe-4c64-a85e-b0dc394be34c.jsonl')).toBe(
      '3d86b708-31fe-4c64-a85e-b0dc394be34c',
    );
    expect(topLevelSessionId('/p/notes.jsonl')).toBeNull();
  });
});
