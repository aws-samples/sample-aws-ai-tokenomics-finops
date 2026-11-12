<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Plan before executing complex work

- Track: Track 1 - AI Coding Assistant · End User
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#plan-before-executing-complex-work
- What it saves: Avoided rework from assumptions caught before implementation. Measure the planning cost against generation, test, and integration work avoided on comparable tasks.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `pbe-q1` Is plan-then-execute the default way developers approach a non-trivial task?

- Fully covered looks like: Use a read-only planning pass for multi-file changes and unfamiliar code. Codex Plan mode can inspect context and propose an approach before implementation starts (OpenAI Codex best practices [98]).
- Evidence: Plan-then-execute as the default for non-trivial work: plan mode, specs.
- Search: docs, agent-config files for `plan mode|/plan|plan.?then`, `requirements\.md|design\.md|tasks\.md|specs?/`

## `pbe-q2` Does the plan define the tests, lint or type checks, review criteria, and stopping condition that prove the task is done?

- Fully covered looks like: Structure the task as Goal, Context, Constraints, and Done when. Use Codex Plan mode before implementation (OpenAI Codex best practices [98]).
- Evidence: Plans that name tests, checks, review criteria and a stopping condition.
- Search: docs, agent-config files for `done when|definition of done|acceptance criteria`, `stopping condition|exit criteria`

Glob sets: docs = **/*.{md,mdx,rst,adoc,txt}; agent-config = **/.kiro/** **/.claude/** **/.codex/** **/.opencode/** **/.agents/** **/AGENTS.md **/CLAUDE.md **/.mcp.json **/mcp.json **/opencode.json

Citations for the reader (not needed to answer): `references/track-1/citations/plan-before-executing-complex-work.md`
