# Title field

```
[Feature Request] Adaptive cache-TTL heuristic: ~37% of 1h writes don't pay back over 5m
```

(Note: the `[Feature Request]` prefix is conventional on this repo, but the template may already prepend something. If so, drop the prefix to avoid duplication.)

---

# Problem Statement

I'm a heavy Claude Code user. I built a local dashboard to understand my own usage, and along the way spotted what looks like a small but tractable optimisation in how the harness picks cache TTLs.

## The short version

- About **37% of Claude Code's 1-hour cache writes provide no measurable benefit over a 5-minute TTL**. The cheaper alternative would have served the same reads.
- That's **~$89/month per heavy user** in avoidable premium on current Opus 4.7 rates. Single user, so I personally don't pay this, but multiplied across the heavy-user tail it's a real efficiency signal.
- **91% of 1-hour cache writes have their first follow-up read within 60 seconds**. An interactive coding cadence too fast for a 5-minute TTL to ever be at risk of expiring.

## Dashboard (last 30 days, single user)

![Cache TTL efficiency dashboard](dashboard.png)

The histogram tells the story: **91% of 1-hour cache writes have their first follow-up read within 60 seconds**. That's interactive coding cadence: read the response, type the next prompt, hit enter. A 5-minute TTL would never be at risk of expiring during that window. The 1-hour premium on these writes is buying nothing.

## Related work

- [#46829](https://github.com/anthropics/claude-code/issues/46829): same JSONL-based methodology (`ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`), argues the opposite direction: 1h saves money for long-session users, with 5m TTL causing 20-32% cost inflation when defaults regressed in early March 2026. Complementary to this finding rather than contradicting it: 1h is the right answer for sessions with gaps, 5m for sessions with continuous fast reads. Both observations point at adaptive selection.
- [#16442](https://github.com/anthropics/claude-code/issues/16442): earlier request for configurable TTL via env var. Addressed in [v2.1.108](https://github.com/anthropics/claude-code/releases/tag/v2.1.108) with `ENABLE_PROMPT_CACHING_1H` and `FORCE_PROMPT_CACHING_5M`. The proposal here is the automatic counterpart to those manual controls.
- [#45381](https://github.com/anthropics/claude-code/issues/45381): bug where `DISABLE_TELEMETRY` forced 5m TTL on subscription accounts (fixed). Confirms 1h is currently the default for Max subscription users, which is why my dataset is dominated by 1h writes.
- [#32671](https://github.com/anthropics/claude-code/issues/32671), [#48082](https://github.com/anthropics/claude-code/issues/48082), [#18915](https://github.com/anthropics/claude-code/issues/18915): Bedrock TTL config and documentation, related but tangential.

<details>
<summary><strong>Full data: mechanics, headline numbers, methodology, worked example, caveats, how to verify</strong></summary>

## The mechanics

Anthropic's prompt cache writes can be tagged with one of two TTLs:

| TTL | Write cost (multiplier) | Lifetime |
|---|---|---|
| 5 minute | 1.25× input | 5 min |
| 1 hour | 2.00× input | 60 min |

A 1-hour write is 60% more expensive per token than a 5-minute write (`2.0 / 1.25 = 1.6×`). That premium pays off if the cache survives a gap long enough that the 5-minute window would have expired but the 1-hour window still serves. If continuous reads keep refreshing the cheaper 5-minute shadow throughout the session, both TTLs would have served the workload identically and the user paid 60% extra for nothing.

Cache reads against either TTL cost the same (0.1× input).

Translated into Opus 4.7 dollars per million tokens (the model in most of my sessions):

| Operation | $ / MTok |
|---|---:|
| Input | $5.00 |
| Cache write (5 min) | $6.25 |
| Cache write (1 hour) | $10.00 |
| Cache read | $0.50 |
| Output | $25.00 |

A 1-hour cache write that didn't need to outlive 5 minutes costs an extra **$3.75 per million tokens** compared with the cheaper alternative.

## The headline finding

Over the last 30 days of my usage (single user, Max plan, heavy interactive coding):

```
Total 1h cache writes:        61.17M tokens / 14,821 writes

  Useful                      37.53M  (61.4%) /  9,293 writes
  Wasted (5m would suffice)   21.83M  (35.7%) /  5,419 writes
  Stale  (no read in 1h)       1.81M  ( 3.0%) /    109 writes

Wasted-premium share:         38.6% by tokens, 37.3% by writes
Overspend (Opus 4.7):         23.64M * $3.75/MTok = $88.66 / 30d
                              (~$89/month at this pace, single user)
```

## Methodology

For each 1-hour cache write in my transcripts, the dashboard walks forward through subsequent cache reads in the same session, refreshing both a 5-minute and a 1-hour shadow TTL on each read (cache reads refresh the TTL clock; sliding TTL semantics). The classification is:

- **Useful:** at some point a read lands when the 5m shadow has died but the 1h shadow still serves. The 1-hour TTL provided unique benefit.
- **Wasted (5m suffices):** continuous reads kept the 5m shadow alive throughout. The 1-hour TTL provided no benefit over the cheaper alternative.
- **Stale:** the 1-hour cache expired before any read landed.

This is more accurate than the cruder heuristics I tried first. A "next-turn within 5 minutes is wasted" check over-counts waste because it ignores later reads that might genuinely need the 1h. A simpler "any read in the 5 to 60 minute window is useful" check under-counts waste because it doesn't model the fact that continuous fast reads keep the 5-minute shadow refreshed indefinitely. The shadow-cache approach mirrors how Anthropic's cache actually behaves in production.

The dashboard scans every JSONL transcript file under `~/.claude/projects` and writes the per-turn `usage` block (including `cache_creation.ephemeral_5m_input_tokens` and `cache_creation.ephemeral_1h_input_tokens`) into a local SQLite database. The classification logic has explicit unit tests covering the read-refresh behaviour; all 13 pass.

## A worked example of the wasted case

Here's what one of the ~37% wasted writes typically looks like: a normal interactive coding loop where the 1-hour premium bought nothing the 5-minute TTL wouldn't have served:

```
09:00:00  You: "fix the bug in foo.ts"
          Claude reads foo.ts, thinks 90s, replies.
          (1) Writes cache (1h TTL) for [sys + tools + foo.ts] = 50k
              At Opus 4.7:    50k * $10/MTok    = $0.5000
              5m would bill:  50k * $6.25/MTok  = $0.3125
              1h premium paid on this write:    = $0.1875

09:01:30  You: "looks good, also check bar.ts"
          (2) Cache READ on the 50k prefix (refreshes both shadows).
          (3) Writes new 1h cache for prefix + bar.ts = 80k.
              Both shadows for the 50k were still alive at this point;
              the 1h provided no benefit the 5m wouldn't have.

09:02:30  You: "run the tests"
          Same story. The 5m shadow keeps refreshing on every read.

09:04:00  You: "now refactor"
          Same story. Across the whole session the 5m shadow never
          expires, so the 1h shadow never gets to do unique work.
```

What makes this different from the useful ~63% of writes: in those, there's a gap somewhere between reads long enough for the 5-minute shadow to die but the 1-hour shadow to still serve. Walking away mid-session, sub-tasks with long thinking, runs that dispatch a long-running tool then return. The 1-hour TTL is doing real work in those sessions. It just isn't the median session for interactive coding.

## Caveats

- **Single-user dataset.** I'm one heavy interactive coding user on a Max 20× plan. The structural pattern is plausibly common (interactive coding cadence is the modal Claude Code workflow), but I can't confirm that from one user's data. You'll have visibility I don't.
- **Workflow specificity.** Heavy agentic workflows with long-running tool calls and subagent dispatches will look different from the data here. The proposal's edge-case handling addresses this, but the headline number is grounded in interactive coding sessions.
- **Pricing model.** All dollar figures use current Opus 4.7 rates. Sonnet 4.6 has the same TTL multipliers (1.25× and 2×), so a Sonnet user with similar cadence would see the same percentage waste at a smaller per-token absolute.
- **Earlier methodologies.** Earlier drafts of this analysis used cruder heuristics (a next-turn check that gave ~97% wasted, and a simple any-read-in-window check that gave ~9%). Both were wrong in different directions. The shadow-cache simulation above is what I trust, and it lands at ~37%, between the two.

## How to verify

If anyone on the team wants to validate the numbers, here is what I can offer immediately:

1. The full SQL schema and queries that produce the aggregates above. They run in a few seconds against any Claude Code user's local SQLite database.
2. An anonymised export of my own dataset (timestamps, model name, cache token sums per turn; no prompt content, no file paths beyond project names).
3. A short call to walk through the methodology and discuss whether your own internal traces match what the JSONLs imply.

You'll have orders of magnitude better visibility than I do via your own production data. I'd love to know whether what I'm seeing in one user's local files matches what you see at scale, and where it diverges. If your conclusion is that the analysis is wrong, please tell me. The methodology above is the bit I'd most want corrected.

</details>

Happy to share the source, the SQL, or an anonymised export. Ping me here.

---

# Proposed Solution

Claude Code already exposes `ENABLE_PROMPT_CACHING_1H` and `FORCE_PROMPT_CACHING_5M` ([v2.1.108](https://github.com/anthropics/claude-code/releases/tag/v2.1.108)), giving users binary, global control over TTL. That covers the case where the user knows their workflow. The proposal here is the automatic counterpart for everyone else: pick the TTL per-session (or per-write) based on observed inter-prompt cadence, so users whose workflow varies (or who never set the env var at all) get the right answer without thinking about it.

A simple adaptive heuristic at the harness layer would close most of the gap without any new API surface or user-visible change:

```
For each cache write, choose TTL based on recent inter-prompt cadence:

  if median(last N inter-prompt gaps in this session) < 5 minutes:
      use 5-minute TTL
  else:
      use 1-hour TTL
```

The harness already has the inter-turn timing data. Re-evaluate per session, possibly per write. A few edge cases worth thinking about:

1. **Cold start.** No prior turns yet. Default to 5-minute, since the user-facing premise of Claude Code is interactive. The downside of being wrong is one cache rebuild on the second turn, which is the same downside the user already absorbs every time they lose a session anyway.
2. **Long-running tool calls.** A Bash command that takes 4 minutes shouldn't push the next turn into the 1-hour-justified bucket. The cadence detector should look at *prompt-to-prompt* gaps, not raw turn-to-turn gaps that include tool wall time.
3. **Subagents and fire-and-forget dispatches.** These often have no meaningful "next turn" cadence. Default to 5-minute for these; the parent session's cache covers the long-window case.

None of these are blockers. They're tuning details on top of a heuristic that, on its own, would eliminate most of the inefficiency.

If even part of this reflects a real heuristic mismatch in the harness, fixing it would be a quietly large win across your subscriber base. Happy to be looped in on whatever the next step looks like, or to just hand the data over and step back if that's more useful.

---

# Alternative Solutions

Approaches I considered and why I'd recommend against each as the primary fix:

- **Static default of 1-hour TTL (current behaviour for Max subscribers).** Wastes the ~37% identified above. Pre-decides for the user without knowledge of session shape.
- **Static default of 5-minute TTL.** Would hurt long-session users with real gaps between prompts. [#46829](https://github.com/anthropics/claude-code/issues/46829) documents the cost inflation this caused when defaults regressed in early March 2026. Solves the wrong half of the problem.
- **Manual env var only (status quo).** `ENABLE_PROMPT_CACHING_1H` and `FORCE_PROMPT_CACHING_5M` already exist, but they require the user to know their workflow shape ahead of time and to know the env vars exist. They also can't adapt within a single session if the workflow changes (e.g. starts interactive, then user walks away for an hour).
- **Provider-based heuristic (e.g. Bedrock defaults to 1h, API defaults to 5m).** Too coarse; ignores intra-provider variation in workflow. A Bedrock user doing interactive coding has the same cadence pattern as an API user doing interactive coding.
- **Expose more knobs (per-session config, per-prompt override).** Adds surface area without solving the core problem, which is that most users don't think about TTLs at all and shouldn't have to.

Adaptive cadence-based selection is the only option I can see that handles all four user-facing cases (interactive coders, long-session researchers, mixed workflows, users who never read the docs) without adding cognitive overhead.
