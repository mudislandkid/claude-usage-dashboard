# A letter to the Claude Code team: a 96% prompt-cache TTL inefficiency

*From Greg Herriott, Ice Point Labs · 5 May 2026*

---

To the Claude Code team,

I'm a heavy Claude Code user. Over the past few months I've been using it daily across a portfolio of personal and client projects, and like a lot of power users I've started to wonder where my 5-hour quota actually goes. So I built a local dashboard that ingests my own `~/.claude/projects/**/*.jsonl` transcripts and surfaces the metrics I cared about. While I was doing that I noticed something I think you'd want to know about.

This letter is the writeup. The short version: across my last 30 days of usage (1,723 transcript files, 82,467 turns, 51.76M tokens written to the 1-hour prompt cache), 96.7% of those 1-hour cache writes had the next turn arrive within 5 minutes. That means a 5-minute TTL would have served the same workload at 60% lower per-write cost. The harness picks the TTL on every request, and the choice it's making appears to be systematically biased toward the longer (more expensive) option in cases where the shorter option would suffice.

I want to be very clear about my intent here before I go into the data. I love Claude Code. Nothing in this letter is a complaint or a dunk. I'm flagging this because I think it's a real cost-optimisation opportunity for Anthropic, and a small infrastructure win for users on subscription plans. The dashboard exists because I wanted to understand my own usage. The finding exists because the data made it visible.

If after reading this you think the analysis is wrong, I'd love to hear that too. The methodology is laid out below; I'd genuinely rather be corrected than vindicated, because either outcome makes the dashboard better at its job.

## The mechanics

Anthropic's prompt cache writes can be tagged with one of two TTLs:

| TTL      | Write cost (multiplier) | Lifetime |
|----------|-------------------------|----------|
| 5 minute | 1.25× input             | 5 min    |
| 1 hour   | 2.00× input             | 60 min   |

A 1-hour write is 60% more expensive per token than a 5-minute write (`2.0 / 1.25 = 1.6×`). That premium pays off if the cache survives a gap longer than 5 minutes. If the next read happens within 5 minutes, both TTLs would have served the workload identically, and the user paid 60% extra for nothing.

Cache reads against either TTL cost the same (0.1× input).

Translated into Opus 4.7 dollars per million tokens (the model in most of my sessions):

| Operation             | $ / MTok |
|-----------------------|----------|
| Input                 | $5.00    |
| Cache write (5 min)   | $6.25    |
| Cache write (1 hour)  | $10.00   |
| Cache read            | $0.50    |
| Output                | $25.00   |

So a 1-hour cache write that didn't need to outlive 5 minutes costs an extra **$3.75 per million tokens** compared with the cheaper alternative.

## A worked example

The mechanics aren't intuitive until you see a session play out. Here's a typical interactive coding loop with the cache writes annotated:

```
09:00:00  You: "fix the bug in foo.ts"
          Claude reads foo.ts, thinks 90s, replies.
          (1) Writes cache (1h TTL) for prefix [sys + tools + foo.ts] = 50k tokens
              Anthropic bills at Opus 4.7:  50k * $10/MTok = $0.50
              A 5m TTL would have billed:   50k * $6.25/MTok = $0.3125
              Premium paid for the 1h: $0.1875 on this single write.

09:01:30  You: "looks good, also check bar.ts"
          (2) Cache READ on the 50k prefix at $0.50/MTok (cheap).
          (3) Writes a new cache (1h TTL) for [sys + tools + foo.ts + bar.ts] = 80k.
              The 50k from 09:00 is now superseded after about 90 seconds of useful life.

09:02:30  You: "run the tests"
          Same story. Read, write a new 1h cache, supersede.

09:04:00  You: "now refactor"
          Same story.
```

Every 1-hour write got read again within 90 seconds or so, and was then superseded by the next prefix. A 5-minute TTL would have served identically. That's the dominant pattern in my sessions, and I suspect in most interactive coding workflows.

There are two distinct failure modes for a 1-hour write:

1. **Wasted (about 97% of my data).** I paid the 1-hour premium, then re-cached the prefix within 90 seconds. The 1-hour protection was for downtime that never happened.
2. **Stale (about 2% of my data).** I paid the 1-hour premium, then walked away. The cache expired without a single read.

The remaining 1.4%, the genuinely useful cases, are when I write a cache, get up for a coffee, come back 20 minutes later, and the prefix is still cached. That's when 1-hour beats 5-minute. It's rare for heavy interactive users.

## How I measured it

The dashboard scans every JSONL transcript file under `~/.claude/projects` and writes the per-turn `usage` block (including `cache_creation.ephemeral_5m_input_tokens` and `cache_creation.ephemeral_1h_input_tokens`) into a local SQLite database.

For the leakage analysis, I look at every turn that wrote `> 0` tokens to the 1-hour cache, find the next turn in the same session, and bucket the gap:

* Gap less than 5 minutes: **wasted, 5m would have sufficed**.
* Gap between 5 and 60 minutes: **useful**. A 5m TTL would have expired; the 1h was justified.
* Gap greater than 60 minutes, or no next turn at all: **wasted, no follow-up**. The 1h cache also expired before the next read.

Then I aggregate across all writes in the trailing 30 days.

## The numbers

```
Total 1h-cache writes (last 30 days):  51,759,665 tokens

  Useful (5 to 60 min gap):                  726,030 tokens   (1.4%)
  Wasted, 5m TTL would suffice:           50,076,616 tokens  (96.7%)
  Wasted, no follow-up in 1h:                957,019 tokens   (1.9%)

Effective leakage rate:                                       98.6%
```

96.7% of my 1-hour cache writes were paid at the 1-hour rate but only used inside the 5-minute window. Around fifty million tokens of cache that didn't need the extra 55 minutes of life.

Translated to Opus 4.7 dollars over those 30 days:

```
50.08M tokens * $3.75 / MTok = $187.80 of premium spend
                               that wasn't returning value.
```

A note on the dollar figure: my first draft of this letter used Opus 4.1 prices (input at $15 per MTok, premium at $11.25 per MTok, monthly waste at $563). With Opus 4.5 onwards you cut Opus base input from $15 to $5 per MTok, so the absolute dollars shrank with the price cut. The percentage of writes that are over-cached, 96.7%, did not change. The structural inefficiency is unchanged by the price reduction; only the absolute waste per user shrank.

I'm one heavy user on a Max 20× plan, so I personally don't pay this bill (you do, in compute). The interesting question is what the same percentage looks like across the heavy-user tail of Claude Code's audience. I'd guess the structural pattern holds, because interactive coding cadence is the modal Claude Code workflow.

The same multipliers (1.25× and 2×) apply to Sonnet 4.6 too, so a Sonnet user with similar cadence would see the same percentage waste, just at a smaller per-token absolute.

## Caveats I want to flag

My "next turn within 5 minutes is wasted" rule is an **upper bound on real waste**, not a lower bound. A single 1-hour write might get read multiple times: at t+3min, t+20min, and t+45min, say. My measurement only checks the immediate next-turn gap, so a write whose first follow-up was at t+3min would land in the wasted bucket even if a t+20min read genuinely needed the longer TTL.

A more precise measurement would, for each 1h write, look at *any* read inside the 5 to 60 minute window. That would lower the wasted percentage somewhat. I'd expect the corrected figure still to be a majority of writes for two reasons:

1. If 96.7% of writes have a *next turn* within 5 minutes, the median session is interactive-tempo. Genuinely sustained writes-then-long-gap patterns are rare in my data.
2. Even at 50% real waste rather than 97%, the structural pattern is still systemic.

I'd happily refine the methodology and re-run if any of you want to look at it more rigorously. The dashboard lives in a private repo for now, but I'm glad to share the source, schema, queries, and an anonymised export with anyone on your team who wants to dig in.

## A proposal

A simple adaptive TTL heuristic at the harness layer would close most of this gap without any new API surface or user-visible UX:

```
For each cache write, choose TTL based on recent inter-turn cadence:

  if median(last N inter-turn gaps in this session) < 5 minutes:
      use 5-minute TTL
  else:
      use 1-hour TTL
```

The harness already has the inter-turn timing data. Re-evaluate per session, possibly per write. A few edge cases worth thinking about:

1. **Cold start.** No prior turns yet. Probably default to 5-minute, since the user-facing premise of Claude Code is interactive. The downside of being wrong is one cache rebuild on the second turn, which is the same downside the user already absorbs every time they lose a session anyway.
2. **Long-running tool calls.** A Bash command that takes 4 minutes shouldn't push the next turn into the 1-hour-justified bucket. The cadence detector should look at *prompt-to-prompt* gaps, not raw turn-to-turn gaps that include tool wall time.
3. **Subagents and fire-and-forget dispatches.** These often have no meaningful "next turn" cadence. Default to 5-minute for these; the parent session's cache covers the long-window case.

None of these are blockers. They're tuning details on top of a heuristic that, on its own, would eliminate the bulk of the inefficiency.

## How to verify

If anyone on the team wants to validate my numbers, here is what I can offer immediately:

1. The full SQL schema and the queries that produce the aggregates above. They run in a few seconds against any Claude Code user's local SQLite database.
2. An anonymised export of my own dataset (timestamps, model name, cache token sums per turn; no prompt content, no file paths beyond project names).
3. A short call to walk through the methodology and discuss whether your own internal traces match what the JSONLs imply.

You will have orders of magnitude better visibility than I do via your own production data. I'd love to know whether what I'm seeing in one user's local files matches what you see at scale, and where it diverges.

If your conclusion is that the analysis is wrong, please tell me. The methodology above is the bit I'd most want corrected. I'd rather know my dashboard is mismeasuring than continue surfacing a misleading number to anyone else who runs it.

## In closing

Thanks for building Claude Code. It's the best agentic coding tool I've used. The reason I bothered building a dashboard, and the reason I'm bothering to write this letter, is that the tool is good enough to be worth instrumenting. If even part of what I'm seeing reflects a real heuristic mismatch in the harness, fixing it would be a quietly large win across your subscriber base.

Happy to be looped in on whatever the next step looks like, or to just hand the data over and step back if that's more useful.

Best,

Greg Herriott
Founder, Ice Point Labs
gregherriott@icepointlabs.com
[icepointlabs.com](https://icepointlabs.com)

---

*The dashboard lives in a private repo for now. Happy to grant access (or send a tarball) to anyone on your team who wants to look at the source.*
