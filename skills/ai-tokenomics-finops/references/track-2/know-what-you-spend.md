<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Know what you spend and what it buys

- Track: Track 2 - Purpose-Built Agentic AI Application · Model Inference
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#know-what-you-spend
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Visibility first. It saves nothing directly on the bill, but every other lever in this layer needs this decomposition to tell you whether it worked.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `kwys-q1` Do you know your total agent spend and how it is constructed?

- Fully covered looks like: Write the equation down and measure every term: spend = users × sessions per user × turns per session × requests per turn × tokens per request × price per token. When the bill moves, name the term that moved it.
- Evidence: Spend decomposed into its terms: token usage read from responses, Bedrock metrics, budgets, bill reviews.
- Search: code, iac, docs files for `\busage\b`, `(input|output)_?tokens|(Input|Output)TokenCount`, `cost explorer|budget`

## `kwys-q2` Do you track cost per successful task, and gate releases on it?

- Fully covered looks like: Divide spend by what it bought: cost per successful task = total spend across all attempts / successful outcomes, and fail a release that raises it even when quality holds.
- Evidence: Cost per successful task measured, and a release gate on it.
- Search: code, docs, config files for `cost.?per.?(successful )?(task|resolution|outcome|ticket)`, `\beval(uation)?s?\b|golden set|regression`

## `kwys-q3` Is every dollar attributed to the team or workload that caused it?

- Fully covered looks like: Attribute in layers, strongest first: the team’s own account, then a tagged application inference profile per application or tenant, then cost allocation tags, then per-user tracking. Call the model through the profile ARN, never a raw model ID.
- Evidence: Attribution: per-team accounts, application inference profiles, cost allocation tags, request metadata.
- Search: iac, code files for `application-inference-profile|ApplicationInferenceProfile|create_inference_profile`, `cost.?allocation|\bTags?\b`, `requestMetadata`

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; docs = **/*.{md,mdx,rst,adoc,txt}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}

Citations for the reader (not needed to answer): `references/track-2/citations/know-what-you-spend.md`
