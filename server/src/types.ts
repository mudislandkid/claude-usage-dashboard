export interface Turn {
  sessionId: string;
  messageId: string | null;
  ts: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cacheCreation5m: number;
  cacheCreation1h: number;
  serviceTier: string | null;
  isSubagent: boolean;
}

export interface SessionInsert {
  sessionId: string;
  projectPath: string;
  projectName: string;
  isSubagent: boolean;
  parentSessionId: string | null;
  firstTs: string;
  lastTs: string;
  primaryModel: string | null;
  entrypoint: string | null;
  version: string | null;
  gitBranch: string | null;
}
