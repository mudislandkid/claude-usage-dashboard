# Day-Anchored Forecast with Actuals Overlay

**Date:** 2026-05-19
**Status:** Design approved, awaiting implementation plan
**Owner:** Greg

## Problem

The current `NEXT_24H_FORECAST` panel shows a rolling 24-hour weekday-average
projection starting at the next hour boundary. It has two limitations:

1. There is no way to compare the forecast against what actually happened. The
   prediction made yesterday is lost the moment the clock advances.
2. There is no way to look at the prediction for a different day. The user can
   neither look ahead to tomorrow's predicted curve nor back at how well prior
   predictions held up.

## Goal

Replace the rolling-window chart with a day-anchored chart that:

- Shows the forecast curve made at the start of any given local day.
- Overlays the actual chargeable tokens consumed during that day as a second
  line, filling in hour by hour as time advances.
- Supports day navigation via arrows in the panel header, with a range of
  **7 days back through 1 day ahead**.

## Out of scope

- Sub-hour granularity. The chart stays bucketed at 1-hour resolution.
- Forecasts beyond `today + 1`.
- Per-model breakdown (e.g., Sonnet vs Opus actuals). The chart stays on the
  same "chargeable" metric as today (`input_tokens + cache_creation_tokens`).
- Backfilling snapshots for days prior to feature rollout. Past days are
  recomputed from history each request; only `today` and `today + 1` are
  persisted.

## High-level architecture

```
+--------------------+        +-----------------------+
|  ForecastPanel     |  uses  |  useForecastDay(date) |
|  (orchestrator)    +-------->  (react-query)        |
+----+---------------+        +-----------+-----------+
     | renders                            |
     v                                    v
+---------------+   +---------------------+
| DayNavigator  |   |  GET /api/forecast  |
| (header nav)  |   |   ?date=YYYY-MM-DD  |
+---------------+   +-----------+---------+
+---------------------+         |
| ForecastDayChart    |         v
| (svg, two lines)    |   +-------------------------+
+---------------------+   | forecastForDay(db,date) |
                          +----+---------------+----+
                               |               |
                               v               v
                       +---------------+  +-------------+
                       | snapshot path |  | history path|
                       | (today/+1)    |  | (past days) |
                       +---------------+  +-------------+
                               |
                               v
                       +----------------------+
                       | forecast_snapshots   |
                       | (sqlite table)       |
                       +----------------------+
```

## Backend

### New SQLite table

```sql
CREATE TABLE IF NOT EXISTS forecast_snapshots (
  local_date       TEXT    PRIMARY KEY,         -- 'YYYY-MM-DD' local time
  by_hour_json     TEXT    NOT NULL,            -- JSON: [{hour:0..23, expectedChargeable:int}]
  total_chargeable INTEGER NOT NULL,
  computed_ts      TEXT    NOT NULL,            -- ISO timestamp of snapshot creation
  window_days      INTEGER NOT NULL DEFAULT 30  -- trailing window used; lets us version
);
```

A migration adds the table. No backfill — snapshots are created lazily when a
request asks for `today` or `today + 1` and the row does not exist.

### Endpoint

Extend the existing `/api/forecast` route to accept an optional `date` query
parameter. Existing callers that omit `date` get the same response shape as
today (no breaking change at the surface), with the response augmented with the
new fields.

```
GET /api/forecast
GET /api/forecast?date=2026-05-19         # explicit local date
GET /api/forecast?date=today              # convenience alias
GET /api/forecast?date=tomorrow           # convenience alias
GET /api/forecast?date=yesterday          # convenience alias
```

**Response:**

```ts
interface ForecastDayResponse {
  date: string;            // 'YYYY-MM-DD' local
  source: 'snapshot' | 'historical';
  byHour: Array<{
    hour: number;          // 0..23 local
    expectedChargeable: number;
    actualChargeable: number | null;  // null = no data yet (future hour) or tomorrow
  }>;
  totalForecast: number;
  totalActual: number | null;  // null when the day has no actuals at all (tomorrow)
  isToday: boolean;
  isPast: boolean;
  currentHour: number | null;  // only set when isToday, 0..23 local
}
```

The `byHour` array always has 24 entries, indexed `0..23` local hour.

### Range validation

The endpoint clamps `date` to `[today − 7, today + 1]` (local). Requests outside
the range return `400 Bad Request` with `{ error: 'date out of range' }`. The
frontend never sends out-of-range dates (the nav buttons disable at the bounds),
so this is a defensive check.

### Forecast computation

Two paths share the same weekday × hour averaging logic that exists today in
`forecastNext24h`, but parameterised by an anchor day and cutoff:

**Snapshot path** — used for `date >= today`:

1. Look up `forecast_snapshots` by `local_date = date`.
2. If a row exists, return its `by_hour_json` and total. Source = `'snapshot'`.
3. If not, compute the forecast using the same weekday-avg algorithm with a
   trailing 30-day cutoff ending at `00:00 local of date`, then `INSERT` the
   row. Source = `'snapshot'`.

**Historical path** — used for `date < today`:

1. Always recompute. Use the same algorithm with the trailing 30-day cutoff
   ending at `00:00 local of date` — strictly **before** the day in question,
   so we are not cheating with hindsight.
2. Do **not** write to `forecast_snapshots`. Source = `'historical'`.

This means a forecast for `2026-05-18` rendered today will be reproducible
later from the same history rows, which keeps the past view honest without
requiring snapshots for every historical day.

### Actuals query

For any day (past or today), the actuals are computed inline:

```sql
SELECT
  CAST(strftime('%H', ts, 'localtime') AS INTEGER) AS hour,
  COALESCE(SUM(input_tokens + cache_creation_tokens), 0) AS chargeable
FROM turns
WHERE date(ts, 'localtime') = ?
GROUP BY hour
ORDER BY hour ASC;
```

The result is merged into `byHour`. Hours with no rows get `actualChargeable: 0`
when the hour is in the past (or `<= currentHour` for today), and `null` for
future hours on today, and `null` for every hour on tomorrow.

### Timezone

The existing `forecastNext24h` uses `getUTCDay()` / `getUTCHours()` on a
`Date` object built from local `now`, which produces inconsistent buckets when
the server is not in UTC. The new endpoint switches the entire pipeline to
**local time** for two reasons:

1. The existing panel sub-label already says "starts at hour HH:00 local".
2. The heatmap, weekly-limits, and gauge widgets all treat days as local.

The old `/forecast` (no-date) path keeps current behavior for compatibility,
but new code should use the dated path.

## Frontend

### File layout

The current `web/src/components/term-widgets/ForecastChart.tsx` is ~180 lines.
Adding navigation + a second line would push it past 300, so we split into
focused units. All files target well under 500 lines (per project convention).

| File | Purpose | Approx. size |
|------|---------|---------------|
| `web/src/components/term-widgets/ForecastPanel.tsx` | Orchestrator: holds selected date, fetches data, composes header + chart | ~140 lines |
| `web/src/components/term-widgets/DayNavigator.tsx` | `‹ LABEL ›` control in the panel's action slot, with disable logic at range bounds | ~70 lines |
| `web/src/components/term-widgets/ForecastDayChart.tsx` | Pure SVG renderer for two lines + now marker + tooltip | ~220 lines |
| `web/src/hooks/useInsights.ts` (extend) | Add `useForecastDay(date)` hook | +15 lines |
| `web/src/lib/forecastDate.ts` (new) | `todayLocal()`, `shiftDate(date, deltaDays)`, `formatDayLabel(date)` | ~50 lines |

The existing `ForecastChart.tsx` is renamed to `ForecastPanel.tsx` to better
reflect its role (the old name suggested it owned the SVG, which it no longer
does).

### State and data flow

```ts
// ForecastPanel.tsx
const today = todayLocal();                // 'YYYY-MM-DD'
const [date, setDate] = useState(today);
const { data, isLoading } = useForecastDay(date);

const canGoBack    = daysBetween(date, today) < 7;
const canGoForward = date < addDays(today, 1);
```

The panel passes `date`, `canGoBack`, `canGoForward`, and `setDate` callbacks
into `<DayNavigator />`. It passes `data` into `<ForecastDayChart />`.

### `DayNavigator`

Rendered into the `TPanel` `action` slot (where `EST CHARGEABLE` lives today).
Layout:

```
‹  TODAY  ›
```

- Left arrow disabled when `!canGoBack`.
- Right arrow disabled when `!canGoForward`.
- Label rules:
  - `date === today` → `TODAY`
  - `date === today + 1` → `TOMORROW`
  - `date === today − 1` → `YESTERDAY`
  - else → uppercase `DDD DD MMM` (e.g., `TUE 18 MAY`)
- Clicking the label itself resets to `TODAY`.
- The original `EST CHARGEABLE` text moves below the nav, or is dropped — it's
  redundant with the headline.

### `ForecastDayChart`

Renders two SVG paths sharing the same Y-scale and X-scale. The Y-scale is
based on `Math.max(...forecastValues, ...actualValues, 1)` so the actual line
isn't clipped if usage exceeds the forecast.

**Forecast line:**

- Solid blue (`TT.blue`), strokeWidth 1.4 (unchanged from today).
- Soft gradient area fill below it (unchanged).
- All 24 dots rendered (unchanged).

**Actual line:**

- Solid green (`TT.green`), strokeWidth 1.6, drawn **on top of** the forecast.
- Soft green gradient area fill below it.
- Dots only at hours that have non-null `actualChargeable`.
- For today, the line stops at `currentHour` and does not extend into future
  hours.
- Hidden entirely when `totalActual === null` (i.e., tomorrow).

**"Now" marker (today only):**

- Thin dashed vertical line at `currentHour`, in `TT.textMute`.
- Small "NOW" text label at the bottom axis.

**Tooltip on hover:**

```
HH:00
forecast  124k
actual    158k   ← omitted when actual is null
```

**Headline number and sub-line:**

| View | Headline | Sub-line |
|------|----------|----------|
| Tomorrow | `totalForecast` (blue) | `chargeable forecast · σ ±X%` |
| Today | `totalForecast` (blue) | `XXk actual so far · YYYk forecast` |
| Past | `totalActual` (green) | `actual · vs YYYk forecast (±Z%)` |

The headline color is the dominant line's color, so the eye immediately maps
"big number = which line".

### Legend

A small inline legend appears below the chart:

```
■ forecast   ■ actual
```

Hidden when there is no actual line (tomorrow).

### Loading / empty states

- Loading: same `Loading…` panel as today.
- Insufficient history (forecast is all zeros): same fallback as today
  (`Insufficient history.`).
- Day navigation arrows remain enabled even during loading, so the user can
  click through quickly.

## Edge cases

- **Day boundary crossover while the panel is open.** When `Date.now()`
  ticks past midnight and the user was viewing `TODAY`, the panel should
  re-resolve `today` and re-fetch. We piggyback on the existing 60-second
  poll interval (or whatever react-query refresh cadence is configured for
  `useForecast`) — the headline label will update to `YESTERDAY` if the
  user had `date` pinned to the prior day by selecting it explicitly, or
  to the new `TODAY` if they were following the live day. **Decision:** the
  `date` state is treated literally — if the user explicitly navigated to
  `2026-05-19`, the panel keeps showing that date after midnight (it now
  reads as `YESTERDAY`). If the user is on the implicit default, we follow
  the live day. To distinguish, the state stores `date | null`, where
  `null` means "follow today".

- **Server restart between snapshot creation and use.** The snapshot is
  durable in SQLite, so a restart is fine. If the snapshot has not yet
  been created when the user first loads the dashboard, the lazy-create
  path handles it.

- **Trailing 30-day cutoff with sparse history.** When the cutoff window
  contains fewer than 7 days of data, the forecast falls back to whatever
  the historical aggregation produces (often near-zero). The existing
  panel already has an "Insufficient history" fallback that triggers
  when `values.length === 0`; we keep that.

- **DST transitions.** SQLite's `strftime('%H', ts, 'localtime')` and the
  server's local-time `Date` arithmetic both honour DST. On a 23- or
  25-hour day, the buckets will still be indexed 0..23; the spring-forward
  day is missing one hour (that bucket will be empty), and the fall-back
  day will have two physical hours summed into one bucket. We accept this
  as a known minor inaccuracy — the existing weekday-avg model also
  glosses over DST.

## Migration / rollout

1. Add the `forecast_snapshots` migration. New deploys get the table empty.
2. Ship the backend + frontend changes together. The old `/forecast` path
   continues to work; the panel switches to the new dated path immediately.
3. On first load each day, the user will see a tiny extra latency for the
   snapshot insert (one DB write). Subsequent loads hit the cached row.
4. No data backfill; past days populate themselves as the user navigates.

## Open questions

None blocking. Items deferred to implementation judgment:

- Exact stroke colors and opacities (will be tuned in-browser).
- Whether the legend should be inline or in a hover tooltip (start with inline).
- React-query stale time for `useForecastDay` (start with 60s, same as the
  existing forecast hook).
