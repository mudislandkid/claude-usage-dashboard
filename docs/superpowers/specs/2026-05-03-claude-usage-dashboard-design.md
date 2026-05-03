# Claude Usage Dashboard — v1 Design

**Date:** 2026-05-03
**Status:** Approved (verbal), pending written review

## Problem

Claude Code writes detailed JSONL transcripts to `~/.claude/projects/**/*.jsonl`. Existing tools (notably `phuryn/claude-usage`) extract a thin slice of this data and present it as raw token counts and dollar costs — neither of which is the right lens for a Pro/Max subscriber whose actual constraint is the 5-hour rolling quota window.

The user has 1,724 sessions across 41 projects (~477 MB), uses parallel subagents heavily, and has stack preferences (React/Vite + shadcn, dark theme, files <500 lines) that the existing tool's Python + Chart.js stack does not match.

## Goal

Build a local-only, single-repo dashboard that ingests the same JSONL data but surfaces six high-signal views aimed at workflow optimization for a heavy Claude Code user on a subscription plan.

## Non-Goals (v1)

- Cowork session tracking (data is server-side, not in JSONL).
- Claude.ai web tracking (no local data).
- Multi-user / team features.
- Cloud sync / hosted version.
- Cost-per-token reporting as a primary lens (kept as a secondary view).
- v2 features: cache-TTL leakage, spend-per-commit, tool-use breakdown, conversation-flow analysis, version-adoption, entrypoint split.

## Architecture

### Repo layout

```
claude-usage-dashboard/
├── server/                    # Node + Fastify backend
│   ├── src/
│   │   ├── scanner/           # JSONL parsing + incremental scan
│   │   ├── db/                # better-sqlite3 schema + queries
│   │   ├── api/               # Fastify route handlers
│   │   ├── watcher/           # chokidar file-watch
│   │   └── index.ts           # entry point
│   └── package.json
├── web/                       # Vite + React frontend
│   ├── src/
│   │   ├── components/        # shadcn-based UI components
│   │   ├── pages/             # Dashboard, Projects, Settings
│   │   ├── hooks/             # data-fetching hooks
│   │   ├── lib/               # formatters, date utils
│   │   └── main.tsx
│   └── package.json
├── docs/superpowers/specs/    # this file
├── phuryn-reference/          # cloned repo, reference only (gitignored)
├── package.json               # root, runs both via concurrently
└── README.md
```

**500-line rule:** every file capped. The dashboard.py 1,303-line antipattern from phuryn must not recur.

### Stack

- **Backend:** Node 20+, TypeScript, Fastify, `better-sqlite3`, chokidar, zod for validation.
- **Frontend:** Vite + React 18 + TypeScript, shadcn/ui, Tailwind (dark default), recharts, TanStack Query for data fetching.
- **Dev runner:** root `npm run dev` uses `concurrently` to run server + web. **The user starts and stops the dev server**, not the implementer.
- **Build check:** `npm run build` at root runs both builds; this is what the implementer runs to verify.

### Data flow

```
~/.claude/projects/**/*.jsonl
        │
        ▼
   chokidar (watch)         scanner (incremental, on-startup + on-change)
        │                          │
        └──────────┬───────────────┘
                   ▼
           better-sqlite3 DB at ~/.claude/usage-dashboard.db
                   │
                   ▼
            Fastify REST API (port 8787)
                   │
                   ▼
        React dashboard (Vite dev port 5173, prod served by Fastify)
```

**DB path:** `~/.claude/usage-dashboard.db` (separate from phuryn's `~/.claude/usage.db` to avoid schema collision).

### Schema (initial)

```sql
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  mtime REAL NOT NULL,
  size_bytes INTEGER NOT NULL,
  lines_processed INTEGER NOT NULL,
  last_scanned_at TEXT NOT NULL
);

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  project_name TEXT NOT NULL,
  is_subagent INTEGER NOT NULL DEFAULT 0,
  parent_session_id TEXT,           -- for subagent attribution
  first_ts TEXT NOT NULL,
  last_ts TEXT NOT NULL,
  primary_model TEXT,
  entrypoint TEXT,                  -- claude-vscode, claude-cli, etc.
  version TEXT,                     -- Claude Code version
  git_branch TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sessions_project ON sessions(project_path);
CREATE INDEX idx_sessions_last_ts ON sessions(last_ts);
CREATE INDEX idx_sessions_parent ON sessions(parent_session_id);

CREATE TABLE turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  message_id TEXT,
  ts TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_5m INTEGER NOT NULL DEFAULT 0,
  cache_creation_1h INTEGER NOT NULL DEFAULT 0,
  service_tier TEXT,
  is_subagent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_turns_session ON turns(session_id);
CREATE INDEX idx_turns_ts ON turns(ts);
CREATE UNIQUE INDEX idx_turns_message_id
  ON turns(message_id) WHERE message_id IS NOT NULL AND message_id != '';
```

Subagent detection: `<session>/subagents/agent-*.jsonl` files map to subagent sessions whose `parent_session_id` is the directory's session UUID.

## Features (v1)

### 1. 5-hour Rolling Window Gauge

The single hero widget at the top of the dashboard. Pro/Max plans are quota-limited per rolling 5h window — this is what actually matters.

- **Display:** circular/arc gauge showing current 5h usage as % of configured limit.
- **Projection:** linear extrapolation of last-15-min burn rate → "Limit ETA: ~38 min" or "Window resets in 2h 14m".
- **Limit configuration:** Settings panel lets the user set a token-budget number for their plan. Default to a Max-plan reasonable value (e.g. ~200k input + cache-creation tokens / 5h, finalized during implementation by sampling user's max-burst windows). Value is editable.
- **Window definition:** rolling, anchored to "now". Aggregates `input_tokens + cache_creation_tokens` across all sessions in the last 5h.

### 2. Cache Effectiveness Score

The single most actionable optimization lever for any subscription user.

- **Formula:** `cache_read / (cache_read + cache_creation + input)` over a configurable window (default: last 7 days).
- **Display:** big number (0–100%), color-coded — red <40%, amber 40–70%, green >70%.
- **Per-project breakdown:** sortable table, lowest scores first (worst offenders surface immediately).
- **Drill-in:** click a project → per-session score, so the user can identify the specific session pattern that wastes cache.

### 3. Subagent Attribution

Parallel-subagent fan-out is invisible in phuryn. The user dispatches multiple agents in parallel for speed and needs to see when this is paying off vs just multiplying tokens.

- **View:** session detail shows `parent + subagents[]` tree, with token totals per branch.
- **Project view:** "subagent multiplier" metric per project — `(parent_tokens + subagent_tokens) / parent_tokens`. High values = heavy fan-out.
- **Filter:** toggle "include subagents" on/off across the entire dashboard so the user can see numbers both ways.

### 4. Project Leaderboard (Active vs Abandoned)

41 projects is a lot. Surface which are alive and which are dead.

- **Table columns:** project name, last touched (relative time), session count, total tokens (last 30d), cache score, active/abandoned badge.
- **Active/abandoned threshold:** last-touched within 14d = active, else abandoned. Configurable.
- **Sort:** default by last-touched desc.
- **Click:** drill into project view (sessions list, model mix, cache score over time).

### 5. Activity Heatmap

24h × 7d grid (hour-of-day × weekday) showing token volume. Visually striking, fun, and surfaces real workflow patterns ("I'm a 10pm coder who burns out by 2am").

- **Color scale:** dark-theme-friendly viridis/inferno-style.
- **Hover:** shows total tokens, session count, top project for that cell.
- **Time-range filter:** last 7d / 30d / 90d / all-time.

### 6. Model Mix Per Project

Stacked horizontal bar showing Opus / Sonnet / Haiku token share per project. Lets the user see if dispatched-subagent cleanup work is correctly going to Haiku, etc.

- **Display:** project list with stacked bars, sorted by total tokens.
- **Hover:** exact percentages and token counts.
- **Group by:** session count vs token count toggle.

## API Surface

```
GET /api/health                     → { ok, db_ready, last_scan_at, files_indexed }
GET /api/window                     → 5h window stats + projection
GET /api/projects                   → leaderboard rows
GET /api/projects/:id               → drill-in: sessions, model mix, cache series
GET /api/sessions/:id               → session detail with subagent tree
GET /api/heatmap?range=7d           → cells[]
GET /api/cache-effectiveness        → overall + per-project
GET /api/model-mix                  → per-project stacked data
GET /api/settings                   → user config (limits, thresholds)
POST /api/settings                  → update config
POST /api/scan                      → force a re-scan
```

All responses zod-validated. Endpoints handlers stay small (<150 lines each); business logic lives in `server/src/db/queries/*.ts`.

## Error Handling

- **Malformed JSONL line:** skip line, increment a `scan_errors` counter, log to stderr. Never crash the scanner.
- **Missing fields in usage block:** treat as zero. Never extrapolate.
- **DB lock contention:** better-sqlite3 is sync, single-process — not expected in v1.
- **Unknown model name:** stored as-is. The model-mix view groups anything containing "opus"/"sonnet"/"haiku" (case-insensitive); rest goes into "other". This avoids the phuryn $0 silent-drop problem.
- **No data yet:** dashboard renders empty-states for each widget, never crashes.

## Testing

- **Scanner:** unit tests against fixtures (sample JSONL lines covering normal turns, subagents, malformed rows, missing fields, the cache-TTL split). Use the user's actual JSONL structure — phuryn's tests have good fixtures we can borrow ideas from.
- **DB queries:** in-memory SQLite, seeded with deterministic fixtures, assert on aggregate values.
- **API:** Fastify supertest-style tests on each route.
- **Frontend:** Vitest + React Testing Library on the data-shaping hooks. Visual components: smoke test that they render without crashing on empty/loading/error/loaded states.

No browser e2e in v1 (the user runs the dev server and tests UI manually).

## Open Questions for Implementation Phase

1. **Window-limit defaults:** what's a sensible Max-plan default? Plan to sample the user's actual peak 5h burst and back into a number, then expose as editable.
2. **Subagent root detection:** three possible signals — file path (`subagents/agent-*.jsonl`), `isSidechain: true` in the message, or following `parentUuid` chains across sessions. Implementation phase picks the most reliable signal by sampling actual data.
3. **DB migration story:** v1 = no migrations needed. Subsequent versions: add `schema_version` table.

## What This Spec Does NOT Cover

- Production deployment (it's a local-only tool).
- Auth (single-user, localhost-only).
- Multi-machine sync.
- Plugin/extension API.
