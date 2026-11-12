<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Context

- Track: Track 2 - Purpose-Built Agentic AI Application · Agent Harness
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#context-budget
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Keeps per-round input bounded, so context cost tracks the task rather than the age of the session.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `csl-q1` Do you measure and budget what each request’s context contains?

- Fully covered looks like: Measure before you cut: input tokens per call = instructions + capability definitions + working context + runtime output + retained state. Record each source’s tokens and how many rounds it survives; whatever is both large and carried across rounds is billed again on every round.
- Evidence: Context per request measured and budgeted: token counts, limits, truncation.
- Search: code files for `count_?tokens|countTokens|input_?tokens|inputTokens`, `token.?budget|max_?context|context.?window|truncat`

## `crs-q3` Are tool and runtime outputs bounded before they enter the context?

- Fully covered looks like: Give every tool an output contract: return the smallest result that supports the next decision, with a pointer to the rest, so a file read, a log search or a page snapshot cannot flood the context.
- Evidence: Tool and runtime outputs bounded before they enter the context.
- Search: code files for `toolResult|tool_result`, `truncat|max_?(output|result)_?(chars|bytes|tokens)|\[:\d+\]`

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}

Citations for the reader (not needed to answer): `references/track-2/citations/context-budget.md`
