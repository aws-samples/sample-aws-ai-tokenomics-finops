<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Match reasoning effort to task complexity

- Track: Track 1 - AI Coding Assistant · End User
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#match-reasoning-effort-to-task-complexity
- What it saves: 50 to 70 per cent on straightforward tasks, because deep reasoning spends extra output tokens, the most expensive kind, and routine work gains no quality from them.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `mre-q1` Do developers choose reasoning effort from task difficulty and validate it on representative workflows?

- Fully covered looks like: Choose reasoning effort from task difficulty, then validate it on representative workflows. Use lower effort for routine, well-specified work and raise it only when deeper analysis improves results.
- Evidence: Reasoning effort chosen by task difficulty and validated on representative work.
- Search: docs, agent-config files for `reasoning.?effort|\beffort\b`, `thinking`

## `mre-q2` Is deep reasoning escalated by exception, reserved for complex work?

- Fully covered looks like: Reserve deep reasoning for multi-step planning, architecture decisions, subtle concurrency bugs, and long-horizon refactors. Escalating by exception keeps the expensive setting where it earns its cost.
- Evidence: Deep reasoning escalated by exception only.
- Search: docs, agent-config files for `ultrathink|think hard|xhigh|\bmax\b effort`, `deep reasoning`

Glob sets: docs = **/*.{md,mdx,rst,adoc,txt}; agent-config = **/.kiro/** **/.claude/** **/.codex/** **/.opencode/** **/.agents/** **/AGENTS.md **/CLAUDE.md **/.mcp.json **/mcp.json **/opencode.json

Citations for the reader (not needed to answer): `references/track-1/citations/match-reasoning-effort-to-task-complexity.md`
