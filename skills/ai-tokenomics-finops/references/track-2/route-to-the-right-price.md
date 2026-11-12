<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Route to the right price

- Track: Track 2 - Purpose-Built Agentic AI Application · Model Inference
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#route-to-the-right-price
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: 50% on batch-eligible work, plus up to approximately 10% on a Global cross-region profile; Flex adds the same 50% on queue-tolerant traffic only where the model card lists it.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `rtp-q1` Do you choose Standard or batch deliberately for each workload?

- Fully covered looks like: Default to Standard for anything a user waits on, and to batch, at half the price, for self-contained single-turn work the model supports and that has no hard deadline, because batch completion is best effort. Check the model card before planning on Flex, Priority or Reserved.
- Evidence: Batch inference jobs or service tiers chosen per workload, versus synchronous on-demand calls.
- Search: code, iac files for `create_model_invocation_job|CreateModelInvocationJob|ModelInvocationJob`, `service_?tier|serviceTier|\bflex\b|\bpriority\b`, `\bbatch\b`

## `rtp-q2` Do you call cross-region inference profiles rather than single-Region model IDs?

- Fully covered looks like: Call a cross-region inference profile instead of a single-Region model ID, so a busy Region does not throttle you. There are two kinds. A Geographic profile (for example US, EU or APAC) only sends requests to Regions inside that geography, so use it when data residency matters; it costs the same as calling the model in the Region you call from. A Global profile can send requests to any supported commercial Region, so use it when residency does not matter; it costs about 10% less. Neither adds a routing charge (Cross-Region inference, Amazon Bedrock User Guide [22], accessed 5 November 2026).
- Evidence: Cross-region inference profile IDs (us., eu., apac., global.) rather than single-Region model IDs.
- Search: code, config files for `\b(us|eu|apac|global|jp|au|ca)\.(anthropic|amazon|meta|mistral|cohere|deepseek|openai)\.`, `model_?id|modelId`

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}

Citations for the reader (not needed to answer): `references/track-2/citations/route-to-the-right-price.md`
