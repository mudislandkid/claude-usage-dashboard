import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { ApiContext } from '../server.js';
import { fiveHourWindow, chargeableInWindowSlice } from '../../db/queries/window.js';
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

    // Effective limit + percent. The bridge's percent is a *snapshot* taken
    // when Claude Code last wrote the statusline (i.e. when the user last
    // submitted a prompt). Tokens flowed locally between that capture and now.
    //
    // To stay in sync we anchor the cap inference to capture-time:
    //   1. Look up how many chargeable tokens we'd counted locally at
    //      sidecar.capturedAt — call it `usedAtCapture`.
    //   2. The implied cap is `usedAtCapture / anthropicPct` (both points
    //      are from the same moment, so the ratio is stable).
    //   3. Today's `percentUsed` = current `used` / that inferred cap.
    //
    // This makes the gauge reflect activity since the last prompt instead
    // of being pinned to the stale snapshot percentage.
    const anthropicPctFraction =
      sidecar?.fiveHourPercent !== null && sidecar?.fiveHourPercent !== undefined
        ? sidecar.fiveHourPercent / 100
        : null;

    let effectiveLimit = limit;
    let percentUsed = limit > 0 ? Math.min(1, used / limit) : 0;

    if (bridgeActive && anthropicPctFraction !== null && anthropicPctFraction > 0) {
      const captureIso = sidecar!.capturedAt;
      const usedAtCapture =
        w.windowStart !== null
          ? chargeableInWindowSlice(opts.ctx.db, w.windowStart, captureIso)
          : 0;
      if (usedAtCapture > 0) {
        effectiveLimit = usedAtCapture / anthropicPctFraction;
        percentUsed = Math.min(1, used / effectiveLimit);
      } else if (used > 0) {
        // No local activity at capture time — fall back to the simple ratio.
        effectiveLimit = used / anthropicPctFraction;
        percentUsed = anthropicPctFraction;
      } else {
        // No local data at all yet — trust the bridge value verbatim.
        percentUsed = anthropicPctFraction;
      }
    }

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
