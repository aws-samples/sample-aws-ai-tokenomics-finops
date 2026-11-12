<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Set reasoning effort per call

- Track: Track 2 - Purpose-Built Agentic AI Application · Model Inference
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#set-reasoning-effort-per-call
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Fewer billed thinking tokens on the steps that do not need deep reasoning. Thinking is billed as output, so the saving lands on the most expensive token type.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `eff-q1` Do you set reasoning effort for each type of step, rather than taking the model default?

- Fully covered looks like: Put the effort level in every request, chosen by what the step does: low for routing, extraction and formatting, and the default or higher only for steps that plan, debug or decide. Where the model lets you, turn thinking off for steps that need no reasoning.
- Evidence: Reasoning effort or thinking budget set per type of step, not left at the model default.
- Search: code, config files for `reasoning_?effort|reasoningEffort|reasoning_config`, `thinking|budget_tokens`, `additionalModelRequestFields`

## `eff-q2` Do you compare output tokens per successful task before you change an effort level?

- Fully covered looks like: Treat effort as a tuned setting. Run a representative set of each step type at two levels, compare output tokens per successful task, latency and task success, and keep the lowest level that still clears your quality bar.
- Evidence: Output tokens per successful task compared before an effort change.
- Search: code, docs files for `output_?tokens|outputTokens|OutputTokenCount`, `\beval(uation)?s?\b`
- Usually only the user knows: search, then ask.

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}; docs = **/*.{md,mdx,rst,adoc,txt}

Citations for the reader (not needed to answer): `references/track-2/citations/set-reasoning-effort-per-call.md`
