import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { ApiContext } from '../server.js';
import { getSettings } from '../../db/queries/settings.js';
import { readStatuslineSidecar } from '../../lib/statusline.js';
import { getOauthUsageFetcher } from '../../lib/oauthUsage.js';
import { computeWeeklyProjection, type WeeklyProjection } from '../../lib/weeklyProjection.js';
import { buildHourOfWeekProfile } from '../../lib/hourOfWeekProfile.js';

interface WeeklyBar {
  percent: number;
  resetsAt: string | null;
  source: 'oauth' | 'statusline';
  projection: WeeklyProjection;
}

function makeBar(
  percent: number,
  resetsAt: string | null,
  source: 'oauth' | 'statusline',
  profile: Parameters<typeof computeWeeklyProjection>[3],
): WeeklyBar {
  return {
    percent,
    resetsAt,
    source,
    projection: computeWeeklyProjection(percent, resetsAt, new Date(), profile),
  };
}

export async function weeklyRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/weekly', async () => {
    const settings = getSettings(opts.ctx.db);
    const statusline = readStatuslineSidecar();
    const fetcher = getOauthUsageFetcher();
    const oauth = await fetcher.getUsage({ enabled: settings.oauthUsageEnabled });
    const profile = buildHourOfWeekProfile(opts.ctx.db);

    // Prefer OAuth values when available — they include the Sonnet split and
    // refresh independently of Claude Code prompts. Fall back to statusline's
    // seven_day field which is captured on every prompt submit.
    let allModels: WeeklyBar | null = null;
    if (oauth.usage?.sevenDayPercent !== null && oauth.usage?.sevenDayPercent !== undefined) {
      allModels = makeBar(
        oauth.usage.sevenDayPercent,
        oauth.usage.sevenDayResetsAt,
        'oauth',
        profile,
      );
    } else if (
      statusline?.sevenDayPercent !== null &&
      statusline?.sevenDayPercent !== undefined
    ) {
      allModels = makeBar(
        statusline.sevenDayPercent,
        statusline.sevenDayResetsAt,
        'statusline',
        profile,
      );
    }

    let sonnet: WeeklyBar | null = null;
    if (
      oauth.usage?.sevenDaySonnetPercent !== null &&
      oauth.usage?.sevenDaySonnetPercent !== undefined
    ) {
      sonnet = makeBar(
        oauth.usage.sevenDaySonnetPercent,
        oauth.usage.sevenDaySonnetResetsAt,
        'oauth',
        profile,
      );
    }

    return {
      allModels,
      sonnet,
      oauth: {
        enabled: settings.oauthUsageEnabled,
        credentialsPresent: oauth.credentialsPresent,
        credentialsSource: oauth.credentialsSource,
        ageSeconds: oauth.ageSeconds,
        lastError: oauth.lastError,
        fetchedAt: oauth.usage?.fetchedAt ?? null,
      },
    };
  });
}
