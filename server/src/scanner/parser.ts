import type { Turn } from '../types.js';

export interface ParsedToolCall {
  sessionId: string;
  messageId: string | null;
  ts: string;
  model: string | null;
  toolName: string;
  isSubagent: boolean;
}

export interface ParsedLine {
  turn: Turn | null;
  toolCalls: ParsedToolCall[];
  meta: {
    sessionId: string | null;
    cwd: string | null;
    entrypoint: string | null;
    version: string | null;
    gitBranch: string | null;
    isSidechain: boolean;
  };
}

interface UsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  service_tier?: string;
  iterations?: unknown[];
}

interface ContentBlock {
  type?: string;
  name?: string;
}

interface JsonlMessage {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  entrypoint?: string;
  version?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  message?: {
    id?: string;
    model?: string;
    role?: string;
    content?: ContentBlock[];
    usage?: UsageBlock;
  };
}

export function parseLine(raw: string, opts: { isSubagentFile: boolean }): ParsedLine {
  const empty: ParsedLine = {
    turn: null,
    toolCalls: [],
    meta: {
      sessionId: null,
      cwd: null,
      entrypoint: null,
      version: null,
      gitBranch: null,
      isSidechain: false,
    },
  };
  if (!raw.trim()) return empty;
  let obj: JsonlMessage;
  try {
    obj = JSON.parse(raw);
  } catch {
    return empty;
  }
  const meta = {
    sessionId: obj.sessionId ?? null,
    cwd: obj.cwd ?? null,
    entrypoint: obj.entrypoint ?? null,
    version: obj.version ?? null,
    gitBranch: obj.gitBranch ?? null,
    isSidechain: !!obj.isSidechain,
  };
  if (obj.type !== 'assistant') return { turn: null, toolCalls: [], meta };
  const m = obj.message;
  if (!m?.usage || !meta.sessionId || !obj.timestamp || !m.model) {
    return { turn: null, toolCalls: [], meta };
  }
  const u = m.usage;
  const isSubagent = opts.isSubagentFile || !!obj.isSidechain;
  const iterationsCount = Array.isArray(u.iterations) && u.iterations.length > 0 ? u.iterations.length : 1;

  const turn: Turn = {
    sessionId: meta.sessionId,
    messageId: m.id ?? null,
    ts: obj.timestamp,
    model: m.model,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheCreation5m: u.cache_creation?.ephemeral_5m_input_tokens ?? 0,
    cacheCreation1h: u.cache_creation?.ephemeral_1h_input_tokens ?? 0,
    serviceTier: u.service_tier ?? null,
    isSubagent,
    iterationsCount,
  };

  const toolCalls: ParsedToolCall[] = [];
  for (const block of m.content ?? []) {
    if (block.type === 'tool_use' && block.name) {
      toolCalls.push({
        sessionId: meta.sessionId,
        messageId: m.id ?? null,
        ts: obj.timestamp,
        model: m.model,
        toolName: block.name,
        isSubagent,
      });
    }
  }

  return { turn, toolCalls, meta };
}
