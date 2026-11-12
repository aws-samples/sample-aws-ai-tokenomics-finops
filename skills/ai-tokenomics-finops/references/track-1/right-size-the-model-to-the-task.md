<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Right-size the model to the task

- Track: Track 1 - AI Coding Assistant · Model Inference
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#right-size-the-model-to-the-task
- What it saves: The largest per-call multiplier a fleet holds is the frontier-to-mid-tier price spread. Central defaults apply it to every session, instead of only the sessions where somebody remembered to switch.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `rsm-q1` Do you set version-controlled model defaults centrally for the fleet?

- Fully covered looks like: Treat the default as a platform decision. Distribute version-controlled configuration with a balanced session model and an efficient background model.
- Evidence: Committed, shared agent settings that set the default model.
- Search: agent-config files for `"model"\s*:`, `^\s*model\s*[=:]`, `ANTHROPIC_(DEFAULT_\w+_)?MODEL`, `defaultModel`

## `rsm-q2` For each subagent, do you select its model and reasoning effort for the delegated task?

- Fully covered looks like: Codex subagents consume more tokens than comparable single-agent runs. Choose each subagent's model and reasoning effort deliberately, based on its task (OpenAI Codex subagents [100]).
- Evidence: Subagent definitions that set their own model and reasoning effort.
- Search: agent-config files for `^\s*model\s*:`, `CLAUDE_CODE_SUBAGENT_MODEL`, `sub-?agent`, `effort`

## `rsm-q3` Does your fleet default to low-to-moderate reasoning effort for routine, well-specified work, with deep reasoning switched on only by exception rather than left on by default?

- Fully covered looks like: Deep reasoning adds output tokens, so using it for a one-line change costs more without improving the answer.
- Evidence: A default reasoning-effort or thinking setting at low or moderate, with deep reasoning by exception.
- Search: agent-config, docs files for `reasoning_?effort`, `effort(Level)?"?\s*[:=]`, `MAX_THINKING_TOKENS`, `thinking`, `ultrathink`

## `rsm-q4` Do you manage your fleet's model default as a lifecycle, not a one-time choice: trialling new models with a small group before they become the default, and auditing your pinned configuration against the provider's retirement schedule?

- Fully covered looks like: A model default set once and never revisited decays from both ends: newer, cheaper models arrive while the one you standardised on drifts toward the vendor's own retirement date. Own both ends of that cycle.
- Evidence: Pinned model IDs in shared config, and a documented trial and retirement-audit process.
- Search: agent-config, docs files for `\b(us|eu|apac|global)?\.?anthropic\.claude-[\w.:-]+`, `deprecat|retire|legacy|end of life`, `pilot|trial group|canary`
- Usually only the user knows: search, then ask.

Glob sets: agent-config = **/.kiro/** **/.claude/** **/.codex/** **/.opencode/** **/.agents/** **/AGENTS.md **/CLAUDE.md **/.mcp.json **/mcp.json **/opencode.json; docs = **/*.{md,mdx,rst,adoc,txt}

Citations for the reader (not needed to answer): `references/track-1/citations/right-size-the-model-to-the-task.md`
