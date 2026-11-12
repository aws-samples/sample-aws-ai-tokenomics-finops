<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# System prompt

- Track: Track 2 - Purpose-Built Agentic AI Application · Agent Harness
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#system-prompt
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Up to about 90% of the prompt’s share of input when a trimmed prompt is also cache-stable (worked example above). The trim alone saves in proportion to the tokens removed, on every call of every task.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `sp-q1` Is your system prompt as lean as it can be?

- Fully covered looks like: The fixed cost of a task is system prompt tokens × model calls per task × input price, paid before the user says a word. Measure the prompt in tokens, strip persona padding and redundant explanation, and keep only the instructions the behaviour needs.
- Evidence: The system prompt: where it is built and how large it is.
- Search: code, docs files for `system_?prompt|systemPrompt|SYSTEM_PROMPT`, `system\s*[=:]|instructions\s*=`

## `sp-q2` Is your system prompt versioned and cache-stable?

- Fully covered looks like: Treat the prompt as a versioned artefact: record token count, task success and cost per task for every version, and keep the prefix byte-stable, with volatile values (date, user, session id) placed after it, so the cache survives every call.
- Evidence: A versioned system prompt with no per-call values (dates, IDs) that break the cache.
- Search: code, config files for `prompt[_ -]?version|promptArn|PromptVersion`, `datetime\.now|Date\.now|time\.time\(|uuid`

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; docs = **/*.{md,mdx,rst,adoc,txt}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}

Citations for the reader (not needed to answer): `references/track-2/citations/system-prompt.md`
