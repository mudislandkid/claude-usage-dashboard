# Claude Usage Dashboard

Local dashboard for Claude Code JSONL transcripts. Six high-signal views aimed at workflow optimization for heavy Claude Code users on a subscription plan:

1. **5-hour rolling window gauge** — current chargeable burn + projected limit ETA. The single number that matters on Pro/Max.
2. **Cache effectiveness** — overall + per-project, color-coded (red <40%, amber 40–70%, green >70%). Worst offenders surface first.
3. **Subagent attribution** — parent/child token roll-up so parallel-agent fan-out is visible.
4. **Project leaderboard** — active vs idle, sortable by recency / tokens / sessions.
5. **Activity heatmap** — hour-of-day × weekday grid. Surfaces real workflow patterns.
6. **Model mix per project** — Opus/Sonnet/Haiku/other split.

## Run

```bash
npm install
npm run dev   # starts server (8787) + web (5173) concurrently
```

The user starts and stops the dev server.

## Build / typecheck / test

```bash
npm run build
npm run typecheck
npm test
```

## Data

- Reads `~/.claude/projects/**/*.jsonl`.
- Stores aggregates in `~/.claude/usage-dashboard.db` (separate from phuryn's `~/.claude/usage.db`).
- Watches for file changes via chokidar; debounced re-scan every 1.5s after activity stops.
- All data stays on your machine.

## Configuration

Settings panel in the dashboard:
- **5h window limit** — default 220k chargeable tokens; tune to match your Pro/Max plan's actual cap.
- **Active project threshold** — default 14 days.
- **Cache score window** — default 7 days.

Settings persist in the SQLite `settings` table.

## Architecture

```
~/.claude/projects/**/*.jsonl
        │
        ▼
   chokidar (watch)         scanner (incremental, on-startup + on-change)
        │                          │
        └──────────┬───────────────┘
                   ▼
           better-sqlite3 (~/.claude/usage-dashboard.db)
                   │
                   ▼
            Fastify REST API (port 8787)
                   │
                   ▼
        React dashboard (Vite dev port 5173)
```

- **server/**: Node 20 + TypeScript + Fastify + better-sqlite3 + chokidar + zod.
- **web/**: Vite + React 18 + Tailwind + shadcn primitives + recharts + TanStack Query.

## What it doesn't track

- **Cowork sessions** (server-side, not written to local JSONL).
- **Claude.ai web** (no local data).
- **Pricing in $$$** — costs are misleading on subscription plans, so we lead with quota-burn instead.

## License

MIT.
