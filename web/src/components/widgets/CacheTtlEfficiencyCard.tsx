import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCacheTtlEfficiency, type CacheTtlEfficiency } from '@/hooks/useCacheTtl';
import { formatPercent, formatTokens } from '@/lib/format';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';

const COLORS = {
  fiveM: 'hsl(160 70% 45%)',
  oneH: 'hsl(38 90% 55%)',
  useful: 'hsl(160 70% 45%)',
  wasted: 'hsl(38 90% 55%)',
  stale: 'hsl(0 70% 55%)',
};

export function CacheTtlEfficiencyCard() {
  const { data, isLoading } = useCacheTtlEfficiency(30);
  if (isLoading || !data) return <Skeleton className="h-[640px]" />;
  return <Inner data={data} />;
}

function Inner({ data }: { data: CacheTtlEfficiency }) {
  const t = data.totals;
  const c = data.classification;
  const totalAnalyzed = c.usefulTokens + c.wasted5mTokens + c.staleTokens;
  const wastePct = totalAnalyzed > 0 ? (c.wasted5mTokens + c.staleTokens) / totalAnalyzed : 0;

  const volumeData = [
    { name: '5-minute TTL', value: t.tokens5m, fill: COLORS.fiveM },
    { name: '1-hour TTL', value: t.tokens1h, fill: COLORS.oneH },
  ];

  const histogramData = data.histogram.map((h) => {
    const isWasted = h.bucket === '<1m' || h.bucket === '1–5m';
    const isUseful = h.bucket === '5–15m' || h.bucket === '15–30m' || h.bucket === '30–60m';
    return {
      ...h,
      fill: isWasted ? COLORS.wasted : isUseful ? COLORS.useful : COLORS.stale,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache TTL efficiency ({data.days}d)</CardTitle>
        <p className="text-xs text-muted-foreground pt-1 max-w-3xl">
          Anthropic's prompt cache supports two TTLs: 5-minute (1.25× input cost) and
          1-hour (2.0× input cost — a 60% premium). Claude Code picks the TTL; users can't
          override. A 1h write only pays back if a cache read lands between 5 and 60 min
          later — otherwise the premium was avoidable.
          <br />
          <span className="opacity-70">
            A copy-paste markdown summary for filing a GitHub issue with Anthropic lives in
            Settings.
          </span>
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <BannerStats data={data} wastePct={wastePct} />

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Volume by TTL">
            <div className="h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={volumeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {volumeData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 6,
                    }}
                    formatter={(v: number) => formatTokens(v)}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs text-muted-foreground text-center">
              {formatPercent(t.share1hByTokens, 0)} of cache writes use the 1h TTL
            </div>
          </Section>

          <Section title="1h writes — strict classification">
            <div className="space-y-3">
              <ClassRow
                color={COLORS.useful}
                label="Useful — cache read landed 5–60 min later"
                tokens={c.usefulTokens}
                writes={c.usefulWrites}
                total={totalAnalyzed}
              />
              <ClassRow
                color={COLORS.wasted}
                label="Wasted — only reads <5 min after (5m TTL would suffice)"
                tokens={c.wasted5mTokens}
                writes={c.wasted5mWrites}
                total={totalAnalyzed}
              />
              <ClassRow
                color={COLORS.stale}
                label="Stale — no cache read in 5–60 min window"
                tokens={c.staleTokens}
                writes={c.staleWrites}
                total={totalAnalyzed}
              />
            </div>
            <p className="text-[10px] text-muted-foreground pt-3 leading-relaxed">
              Strict methodology: a 1h write is "useful" iff <em>any</em> later turn in the
              same session reads cache 5–60 min after. This is more accurate than the
              "next-turn" heuristic shown in the older 1-hour cache leakage card below.
            </p>
          </Section>
        </div>

        <Section title="Time to next cache read (1h writes)">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={histogramData}>
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => formatTokens(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                  }}
                  formatter={(v: number, name: string) =>
                    name === 'tokens' ? [formatTokens(v), 'tokens'] : [v, name]
                  }
                />
                <Bar dataKey="tokens" radius={[4, 4, 0, 0]}>
                  {histogramData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-muted-foreground">
            Bars in green sit in the 1h-pays-off zone (5–60 min). Bars in amber are wasted
            — a 5m TTL would have been free of premium and still served the read. Red is
            stale (no read at all).
          </div>
        </Section>

        <CostSection data={data} />
      </CardContent>
    </Card>
  );
}

function BannerStats({ data, wastePct }: { data: CacheTtlEfficiency; wastePct: number }) {
  const t = data.totals;
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Stat
        label="1h cache premium wasted"
        value={formatPercent(wastePct, 1)}
        tone={wastePct >= 0.7 ? 'danger' : wastePct >= 0.4 ? 'warning' : 'good'}
      />
      <Stat label="1h tokens written" value={formatTokens(t.tokens1h)} />
      <Stat label="5m tokens written" value={formatTokens(t.tokens5m)} />
      <Stat
        label={`Est. premium / mo (Anthropic cost)`}
        value={`$${data.cost.totalPremiumUsdMonthly.toFixed(0)}`}
        tone={data.cost.totalPremiumUsdMonthly >= 100 ? 'danger' : 'muted'}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warning' | 'danger' | 'muted';
}) {
  const cls =
    tone === 'danger'
      ? 'text-red-300 border-red-500/30 bg-red-500/5'
      : tone === 'warning'
        ? 'text-amber-300 border-amber-500/30 bg-amber-500/5'
        : tone === 'good'
          ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5'
          : 'text-foreground border-border bg-muted/30';
  return (
    <div className={`rounded-md border px-3 py-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">{title}</div>
      {children}
    </div>
  );
}

function ClassRow({
  color,
  label,
  tokens,
  writes,
  total,
}: {
  color: string;
  label: string;
  tokens: number;
  writes: number;
  total: number;
}) {
  const pct = total > 0 ? tokens / total : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
          <span className="size-2 rounded-sm shrink-0" style={{ background: color }} />
          <span className="text-muted-foreground truncate">{label}</span>
        </div>
        <span className="tabular-nums">
          {formatTokens(tokens)} ({writes.toLocaleString()} writes)
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full transition-[width]"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}

function CostSection({ data }: { data: CacheTtlEfficiency }) {
  const c = data.cost;
  if (c.perModel.length === 0) {
    return (
      <Section title="Estimated overspend">
        <div className="text-sm text-muted-foreground">
          No wasted 1h writes detected in the last {data.days} days.
        </div>
      </Section>
    );
  }
  return (
    <Section title="Estimated overspend">
      <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-sm text-muted-foreground">
            Premium paid for 1h TTL on writes that didn't need it
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            ${c.totalPremiumUsdSampled.toFixed(2)}
            <span className="text-sm text-muted-foreground font-normal ml-2">
              over {data.days}d
            </span>
          </div>
        </div>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left py-1">Model</th>
              <th className="text-right py-1">Wasted tokens</th>
              <th className="text-right py-1">Premium ({data.days}d)</th>
            </tr>
          </thead>
          <tbody>
            {c.perModel.map((m) => (
              <tr key={m.model} className="border-t border-border">
                <td className="py-1.5 capitalize">{m.model}</td>
                <td className="py-1.5 text-right tabular-nums">{formatTokens(m.wastedTokens)}</td>
                <td className="py-1.5 text-right tabular-nums">${m.premiumUsd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          ${c.totalPremiumUsdMonthly.toFixed(0)}/month projected. You're on a flat-rate plan
          so this hits Anthropic's compute bill, not your wallet — but multiplied across
          heavy users it's a real efficiency signal worth flagging.
        </p>
      </div>
    </Section>
  );
}

