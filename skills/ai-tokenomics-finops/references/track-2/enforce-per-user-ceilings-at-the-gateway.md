<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Guardrails and limits

- Track: Track 2 - Purpose-Built Agentic AI Application · Agent Harness
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#enforce-per-user-ceilings-at-the-gateway
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Caps aggregate and per-caller consumption, preventing concurrent workflows or one shared caller from multiplying otherwise controlled cost.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `ceb-q1` Are concurrency, queue depth and fan-out bounded in dispatcher code?

- Fully covered looks like: A termination rule makes one workflow finite; dispatcher limits (queue depth, worker count, concurrency, fan-out width) decide how many finite workflows run at once. Enforce them in code, not in prompts.
- Evidence: Bounded concurrency, queue depth and fan-out in dispatcher code.
- Search: code, iac, config files for `Semaphore|max_workers|concurrency|ReservedConcurrentExecutions|MaximumConcurrency`, `asyncio\.gather|Promise\.all|ThreadPool`, `queue`

## `ceb-q2` Are request, token and connection limits enforced per caller at the gateway?

- Fully covered looks like: At the gateway, limit requests, tokens and connections per caller, tenant or target, keyed to an identity the gateway already validates. Request count alone does not describe request cost.
- Evidence: Request, token and connection limits per caller at the gateway.
- Search: iac, config, code files for `UsagePlan|Throttl|RateLimit|rate_?limit`, `\b(tpm|rpm)\b|max_budget`, `per.?(user|caller|tenant)`

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}

Citations for the reader (not needed to answer): `references/track-2/citations/enforce-per-user-ceilings-at-the-gateway.md`
