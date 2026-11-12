<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Route to the right model

- Track: Track 2 - Purpose-Built Agentic AI Application · Model Inference
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#route-to-the-right-model
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Blended bill under half the frontier-only baseline through tiered routing (worked example above). Lifecycle audit prevents Legacy pricing surprises, and rushed migrations when a Legacy period is as short as 45 days.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `rtm-q1` Does each request go to the cheapest model that meets your quality bar?

- Fully covered looks like: Send each step to the cheapest model that clears your quality bar, judged by cost per solved task: blended cost = f × cheap model cost + (1 − f) × frontier model cost, where f is the fraction of requests the cheaper model can serve.
- Evidence: Which models are called for which requests, and any routing to a cheaper model.
- Search: code, config files for `model_?id|modelId`, `route|router|prompt.?router`, `haiku|sonnet|opus|nova|llama|mistral`

## `rtm-q2` Do you audit pinned model IDs against the lifecycle pages?

- Fully covered looks like: Keep an inventory of every pinned model ID and check it monthly against both the Bedrock and the Anthropic lifecycle pages. For an older Bedrock model, move off it before Legacy turns into extended-access pricing. For a model launched on or after 7 September 2026, record the card’s end-of-life date and Legacy period, and plan to finish the migration inside that period.
- Evidence: Pinned model IDs and an audit of them against the Bedrock lifecycle pages.
- Search: code, config, docs files for `\b((us|eu|apac|global|jp|au|ca)\.)?(anthropic|amazon|meta|mistral|cohere|deepseek|openai|qwen)\.[\w.-]+(:\d+)?`, `lifecycle|legacy|deprecat`

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}; docs = **/*.{md,mdx,rst,adoc,txt}

Citations for the reader (not needed to answer): `references/track-2/citations/route-to-the-right-model.md`
