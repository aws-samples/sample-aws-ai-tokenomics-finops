<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Orchestration

- Track: Track 2 - Purpose-Built Agentic AI Application · Agent Harness
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#bound-the-reasoning-loop
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Bounds the orchestration multiplier, removing avoidable calls and keeping coordination proportional to useful work.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `bso-q1` Do loops have termination and retry limits, with rules where rules suffice?

- Fully covered looks like: Put the stopping, retry and routing rules in code: an iteration cap, a session token budget, a completion exit, retries only for transient failures, and a deterministic branch wherever the inputs decide it.
- Evidence: Agent loops with termination and retry limits.
- Search: code, config files for `while\s*(True|\(\s*true\s*\))`, `max_?(iterations|turns|steps|rounds|retries)|recursion_limit`, `retr(y|ies)|backoff|stopReason`

## `bso-q2` Is multi-agent used only where it beats a single agent?

- Fully covered looks like: Establish a single-agent baseline first. multi-agent cost ≈ N × (worker context + worker execution) + coordination + synthesis, so add workers only for independently divisible work, and have them hand back distilled results, not transcripts.
- Evidence: Multi-agent designs, and whether they beat a single agent.
- Search: code, docs files for `multi.?agent|supervisor|swarm|handoff`, `orchestrat|sub.?agent`

## `bso-q3` Do you measure the full cost of a workflow, including retries and coordination?

- Fully covered looks like: Instrument the whole workflow, not just the worker calls: execution, retries, idempotency, checkpointing, coordination and synthesis, per workflow version and per outcome. Trend the orchestration-to-execution token ratio.
- Evidence: Workflow cost measured end to end, including retries and coordination.
- Search: code, docs files for `cost per (workflow|task|run)`, `attempts?|retr(y|ies)`, `\busage\b`

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}; docs = **/*.{md,mdx,rst,adoc,txt}

Citations for the reader (not needed to answer): `references/track-2/citations/bound-the-reasoning-loop.md`
