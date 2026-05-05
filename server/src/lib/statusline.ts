import fs from 'node:fs';
import { STATUSLINE_SIDECAR } from '../config.js';

/**
 * Bridge to Claude Code's statusline JSON.
 *
 * Claude Code (v2.1.80+) pipes a JSON payload to whatever shell command is
 * configured as `statusLine.command` in ~/.claude/settings.json. The payload
 * includes `rate_limits.five_hour.{used_percentage, resets_at}` — the actual
 * server-side computed numbers Anthropic enforces against. There is no other
 * way to access these locally; the JSONL session files don't contain them.
 *
 * Greg's bridge: configure `statusLine.command` to `tee` stdin into
 * STATUSLINE_SIDECAR (and discard stdout so nothing pollutes the bar). This
 * module reads the most recent payload to populate the dashboard.
 */
export interface StatuslineSnapshot {
  fiveHourPercent: number | null;
  fiveHourResetsAt: string | null; // ISO
  sevenDayPercent: number | null;
  sevenDayResetsAt: string | null;
  capturedAt: string;
  ageSeconds: number;
}

export function readStatuslineSidecar(
  now = new Date(),
  path = STATUSLINE_SIDECAR,
): StatuslineSnapshot | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(path);
  } catch {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return null;
  }

  const rl = (payload as { rate_limits?: unknown })?.rate_limits;
  if (!rl || typeof rl !== 'object') return null;

  const fiveHour = (rl as { five_hour?: unknown }).five_hour;
  const sevenDay = (rl as { seven_day?: unknown }).seven_day;

  const fhPct = pickNumber(fiveHour, 'used_percentage');
  const fhResetEpoch = pickNumber(fiveHour, 'resets_at');
  const sdPct = pickNumber(sevenDay, 'used_percentage');
  const sdResetEpoch = pickNumber(sevenDay, 'resets_at');

  return {
    fiveHourPercent: fhPct,
    fiveHourResetsAt: fhResetEpoch !== null ? new Date(fhResetEpoch * 1000).toISOString() : null,
    sevenDayPercent: sdPct,
    sevenDayResetsAt: sdResetEpoch !== null ? new Date(sdResetEpoch * 1000).toISOString() : null,
    capturedAt: stat.mtime.toISOString(),
    ageSeconds: Math.max(0, Math.round((now.getTime() - stat.mtimeMs) / 1000)),
  };
}

function pickNumber(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
