import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { ApiContext } from '../server.js';
import { fiveHourWindow } from '../../db/queries/window.js';
import { getSettings } from '../../db/queries/settings.js';
import { readStatuslineSidecar } from '../../lib/statusline.js';

export async function windowRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/window', async () => {
    const w = fiveHourWindow(opts.ctx.db);
    const settings = getSettings(opts.ctx.db);
    const limit = settings.windowLimitTokens;
    const used = w.totalChargeable;

    const nowMs = Date.now();
    const sidecar = readStatuslineSidecar();

    // Prefer Anthropic's authoritative values when the sidecar is present and
    // its 5h reset is still in the future. If the reset has passed, the value
    // is stale (a new window has begun and Claude Code hasn't yet emitted a
    // statusline update for it).
    const sidecarFresh =
      sidecar !== null &&
      sidecar.fiveHourPercent !== null &&
      sidecar.fiveHourResetsAt !== null &&
      new Date(sidecar.fiveHourResetsAt).getTime() > nowMs;
    const bridgeActive = sidecarFresh;

    // When the bridge is on, Anthropic's reported 5h percent is authoritative
    // for the gauge *percentage* and reset time (used below). Claude Code
    // re-pipes its statusline JSON continuously while a session is running, so
    // this fraction is effectively live (not just on prompt submission).
    const anthropicPctFraction =
      sidecar?.fiveHourPercent !== null && sidecar?.fiveHourPercent !== undefined
        ? sidecar.fiveHourPercent / 100
        : null;

    // Effective limit is ALWAYS the configured / plan window limit. We used to
    // reverse-engineer an implied cap from Anthropic's percent (used / pct)
    // while the bridge was live, but that denominator sawtoothed on every poll:
    // Anthropic reports the percent in coarse integer steps while our local
    // token count moves continuously, so used/pct swung wildly between frames
    // (e.g. 21.5M → 35.3M). Pinning to the configured limit keeps the
    // denominator — and everything derived from it (headroom, projection) —
    // stable. The bridge still drives the authoritative percentUsed below.
    const effectiveLimit = limit;

    const percentUsed = bridgeActive
      ? Math.min(1, anthropicPctFraction ?? 0)
      : limit > 0
        ? Math.min(1, used / limit)
        : 0;

    const minutesToReset = bridgeActive
      ? Math.max(0, (new Date(sidecar!.fiveHourResetsAt!).getTime() - nowMs) / 60_000)
      : w.windowActive && w.windowEnd
        ? Math.max(0, (new Date(w.windowEnd).getTime() - nowMs) / 60_000)
        : null;

    // Run-out projection in local-token units. Null when not active, no burn,
    // or projected exhaustion is past the reset.
    const remainingTokens = Math.max(0, effectiveLimit - used);
    const hasActiveWindow = bridgeActive || w.windowActive;
    let minutesToLimit: number | null = null;
    let projectedTokensAtReset: number | null = null;
    let headroomTokensAtReset: number | null = null;
    if (hasActiveWindow && w.burnRatePerMin > 0 && minutesToReset !== null) {
      const rawEta = remainingTokens / w.burnRatePerMin;
      minutesToLimit = rawEta < minutesToReset ? rawEta : null;
      projectedTokensAtReset = Math.round(used + w.burnRatePerMin * minutesToReset);
      headroomTokensAtReset = Math.max(0, Math.round(effectiveLimit - projectedTokensAtReset));
    }

    return {
      ...w,
      // Override windowActive when the bridge says we're inside a window
      // even if local turns haven't been recorded yet.
      windowActive: hasActiveWindow,
      limitTokens: limit,
      effectiveLimitTokens: Math.round(effectiveLimit),
      percentUsed,
      minutesToReset,
      minutesToLimit,
      projectedTokensAtReset,
      headroomTokensAtReset,
      bridge: {
        active: bridgeActive,
        source: bridgeActive ? ('anthropic' as const) : ('estimated' as const),
        sidecarPresent: sidecar !== null,
        capturedAt: sidecar?.capturedAt ?? null,
        ageSeconds: sidecar?.ageSeconds ?? null,
        fiveHourPercent: sidecar?.fiveHourPercent ?? null,
        fiveHourResetsAt: sidecar?.fiveHourResetsAt ?? null,
        sevenDayPercent: sidecar?.sevenDayPercent ?? null,
        sevenDayResetsAt: sidecar?.sevenDayResetsAt ?? null,
      },
    };
  });
}
