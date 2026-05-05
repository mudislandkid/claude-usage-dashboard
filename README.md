# Claude Usage Dashboard

A local, privacy-first dashboard for Claude Code that shows your **real** 5-hour rolling window usage and **weekly limits** — the same numbers the Claude.ai app shows — alongside deep workflow insights derived from your `~/.claude/projects/**/*.jsonl` transcripts.

The defining feature is the **Anthropic bridge**: a tiny statusline shim plus an opt-in OAuth fetcher that pull Anthropic's authoritative `rate_limits` and weekly utilization values directly. No more guessing the cap from old calibration data.

---

## Highlights

1. **5-hour window gauge** — live percent-used from Anthropic when the bridge is on; falls back to an anchored, top-of-hour estimate from your local JSONL otherwise. Includes "resets in HH:MM" countdown and "hits limit in 38m" / "on track — 12k headroom by reset" projections.
2. **Weekly limits card** — All-models bar via the statusline bridge, plus optional Sonnet-only bar via the OAuth fetcher. Each bar projects "Projected to hit 100% on Sat 9:30 PM at current avg pace — approximately 1d 4h before reset" so you can see exactly when you'll get cut off.
3. **Cache effectiveness** — overall + per-project, color-coded.
4. **Subagent attribution** — parent/child token roll-up.
5. **Project leaderboard, activity heatmap, model mix, cost-per-shipped-commit, TTL leakage, version adoption, tool use, model recommendations.**

---

## Quickstart

```bash
git clone <this repo>
cd claude-usage-dashboard
npm install
npm run dev    # starts server (8790) + web (5173) concurrently
```

Open http://localhost:5173. The dashboard scans `~/.claude/projects/**/*.jsonl` once at boot and watches for changes.

> **Note:** the dev server is meant to be started/stopped manually. `npm run build && npm start` produces a production bundle if you want to run it under a process manager.

### Environment overrides

Copy `.env.example` to `.env` if you need to change the port or bind address:

```bash
cp .env.example .env
# edit .env then npm run dev
```

If you change `PORT`, also update the proxy target in [web/vite.config.ts](web/vite.config.ts).

---

## The Anthropic bridge — required for accurate %

Without the bridge the dashboard estimates your 5h percent from local JSONL files using the formula `input + cache_creation`. Anthropic's actual rate-limit token unit is **opaque and not derivable from JSONL** — community-calibrated presets routinely miss by 2–4×. With the bridge, the gauge matches the Claude.ai app to the decimal point.

There are two layers, both optional but stackable:

### Layer 1 — Statusline sidecar (free, no API calls)

Claude Code v2.1.80+ pipes a JSON payload to whatever shell command is configured as `statusLine.command`. The payload includes:

```json
{
  "rate_limits": {
    "five_hour":  { "used_percentage": 23.5, "resets_at": 1738425600 },
    "seven_day":  { "used_percentage": 41.2, "resets_at": 1738857600 }
  }
}
```

We `tee` that JSON into `~/.claude/usage-dashboard.statusline.json` on every prompt submit. The dashboard reads this sidecar to populate the 5h gauge and the All-models weekly bar.

**Setup — no existing statusline:**

Add this to `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "tee \"$HOME/.claude/usage-dashboard.statusline.json\" > /dev/null"
}
```

**Setup — already have a statusline:**

Pipe through `tee` first, then through your existing command. Both downstream consumers see the same stdin via the pipe:

```json
"statusLine": {
  "type": "command",
  "command": "tee \"$HOME/.claude/usage-dashboard.statusline.json\" | <YOUR EXISTING STATUSLINE COMMAND HERE>"
}
```

For example, if your current command is the model-and-git-branch shell snippet, the bridged version becomes:

```json
"command": "tee \"$HOME/.claude/usage-dashboard.statusline.json\" | { input=$(cat); current_dir=$(echo \"$input\" | jq -r '.workspace.current_dir'); model=$(echo \"$input\" | jq -r '.model.display_name'); git_branch=$(cd \"$current_dir\" 2>/dev/null && git branch --show-current 2>/dev/null); if [ -n \"$git_branch\" ]; then git_info=\" ($git_branch)\"; else git_info=\"\"; fi; printf \"%s@%s:%s%s [%s]\" \"$(whoami)\" \"$(hostname -s)\" \"$(basename \"$current_dir\")\" \"$git_info\" \"$model\"; }"
```

After editing `settings.json`, **restart any open Claude Code sessions** so the harness reloads the new command. Submit one prompt to Claude Code; the dashboard's 5h gauge will jump from "Estimated" to "Live · Anthropic" within seconds.

The exact same install snippet (with copy buttons) lives in **Settings → Anthropic bridge** in the dashboard UI.

### Layer 2 — OAuth fetcher (opt-in, adds Sonnet weekly bar)

The Claude.ai web app populates its "Plan usage limits" page via an undocumented endpoint `https://api.anthropic.com/api/oauth/usage`. It returns:

```json
{
  "five_hour":         { "utilization": 30, "resets_at": "..." },
  "seven_day":         { "utilization": 33, "resets_at": "..." },
  "seven_day_sonnet":  { "utilization": 6,  "resets_at": "..." }
}
```

Enabling this lets the dashboard show the **Sonnet-only weekly bar** (statusline only emits the all-models seven_day, not the per-model breakdown).

**To enable:**

1. Open the dashboard → **Settings → Anthropic OAuth fetch (weekly limits)**.
2. Confirm "Credentials found" appears (file or keychain).
3. Click **Enable**.
4. Within a few seconds the Sonnet bar populates on the dashboard.

**Where credentials are read from:**

| OS              | Source                                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| Linux / WSL     | `~/.claude/.credentials.json` (read-only, never written)                       |
| macOS           | Login keychain, service `Claude Code-credentials`. First read prompts; click *Always Allow* to suppress future prompts. |
| Windows         | Not yet implemented (PRs welcome).                                             |

The token is read on each fetch and never persisted. Caching:

- Cache TTL: 5 minutes.
- Failure backoff: 5 minutes (won't hammer the endpoint if it errors).
- Cache file: `~/.claude/usage-dashboard.usage-api.json` (gitignored, deletable).

The fetcher is opt-in because (a) the endpoint is undocumented and may change, and (b) some users may not want the server making outbound HTTPS calls on their token.

---

## Settings reference

All settings live in the dashboard's **Settings** page and persist to the SQLite `settings` table.

| Setting                       | Default                | Description                                                                        |
| ----------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| Plan preset                   | Custom                 | Sets `windowLimitTokens` from a curated preset. Auto-calibrate uses your p95×1.1.  |
| 5h window limit (chargeable)  | 220k                   | Local fallback cap when the bridge is off. Auto-overridden when the bridge is on (effective limit is back-derived from Anthropic's % vs your local tokens). |
| Active project threshold      | 14 days                | Cutoff for active vs idle in the project leaderboard.                              |
| Cache score window            | 7 days                 | Time window for cache effectiveness rollup.                                        |
| Anthropic bridge install      | (snippet)              | Copy-paste statusline command for `~/.claude/settings.json`.                       |
| OAuth fetch (weekly limits)   | Disabled               | Toggle for Layer 2. Off by default.                                                |

---

## Architecture

```
~/.claude/projects/**/*.jsonl                 ~/.claude/usage-dashboard.statusline.json
        │                                              ▲ (tee from statusline command)
        ▼                                              │
   chokidar (watch)         scanner ─────────┐    api.anthropic.com/api/oauth/usage
        │                          │         │              ▲
        └──────────┬───────────────┘         │              │ (opt-in, OAuth bearer)
                   ▼                         │              │
           better-sqlite3                    │              │
        (~/.claude/usage-dashboard.db)       │              │
                   │                         │              │
                   ▼                         ▼              ▼
                       Fastify REST API (port 8790, localhost-only)
                                       │
                                       ▼
                       React dashboard (Vite dev port 5173)
```

- **server/**: Node 20 + TypeScript + Fastify + better-sqlite3 + chokidar + zod.
- **web/**: Vite + React 18 + Tailwind + shadcn primitives + recharts + TanStack Query.

### Files written to disk

The dashboard never modifies your Claude Code files. It writes only to:

| Path                                          | Purpose                              |
| --------------------------------------------- | ------------------------------------ |
| `~/.claude/usage-dashboard.db`                | SQLite aggregates of your transcripts (separate DB; phuryn's `~/.claude/usage.db` is untouched). |
| `~/.claude/usage-dashboard.statusline.json`   | Sidecar written by your statusline command. |
| `~/.claude/usage-dashboard.usage-api.json`    | OAuth fetch cache (only if Layer 2 is enabled). |

All three are gitignored; safe to delete to reset state.

---

## Build, typecheck, test

```bash
npm run build       # builds both workspaces
npm run typecheck   # tsc --noEmit across server + web
npm test            # vitest, both workspaces
```

---

## Troubleshooting

**Dashboard says "Estimated" forever even after I added the statusline command.**

- Did you restart open Claude Code sessions? The harness only reloads the command on session start.
- Submit at least one prompt — the sidecar is written on prompt submit.
- Check the file: `cat ~/.claude/usage-dashboard.statusline.json | jq .rate_limits` — it should show `five_hour` and `seven_day` objects.
- The bridge skips if `rate_limits` is missing. That field is only present for Pro/Max subscribers after the first API response in a session.

**Statusline output got blanked out.**

- You probably replaced your existing command instead of piping through `tee`. Use the "already have a statusline" form from the [bridge section](#layer-1--statusline-sidecar-free-no-api-calls).

**OAuth fetch says "No credentials found".**

- On macOS, ensure you've logged into Claude Code at least once (`claude login` or first session) — that's what creates the keychain entry. The dashboard reads it via `security find-generic-password`.
- On Linux, `~/.claude/.credentials.json` should exist. If it doesn't, log into Claude Code.

**Keychain prompt keeps appearing every fetch.**

- Click **Always Allow** in the prompt. It only happens once per binary (the Node process running the dashboard server).

**My weekly Sonnet bar shows "Not enough data for projection yet".**

- Projections gate behind 1 hour of elapsed window time and >0% used. A fresh weekly window or a fresh enabling won't have a projection yet — wait an hour.

**The 5h gauge shows a different % than Claude Code's `/usage` page.**

- That should not happen with the bridge on. If it does, your sidecar is stale — submit a prompt in Claude Code to refresh.

**Port 8790 is already in use.**

- Set `PORT` in `.env` and update the proxy target in `web/vite.config.ts`.

---

## Privacy & security

- Default bind is `127.0.0.1`. Don't expose to the network — the dashboard reads your full JSONL transcripts.
- The OAuth token is read on each fetch from the OS-managed source and never persisted by the dashboard. The cache file holds only the response (utilizations + timestamps), not the token.
- Costs aren't shown in $$$ — they're misleading on subscription plans where you've already paid the flat fee. The dashboard leads with quota burn instead.

---

## What it doesn't track

- **Cowork sessions** (server-side, not written to local JSONL).
- **Claude.ai web** (no local transcript).
- **The "Claude Design" weekly category** shown on Claude.ai — not exposed in any community-known endpoint.

---

## License

MIT.
