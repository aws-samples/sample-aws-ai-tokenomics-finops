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

## Citations

- [71] Control agent behaviors and cost beyond a single action: new capabilities in Amazon Bedrock AgentCore. AWS Machine Learning Blog, Aug 2026. https://aws.amazon.com/blogs/machine-learning/control-agent-behaviors-and-cost-beyond-a-single-action-new-capabilities-in-amazon-bedrock-agentcore/
- [33] Inference connector targets. Amazon Bedrock AgentCore Developer Guide, AWS. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-inference-connector.html
- [67] Add rate limits to a gateway. Amazon Bedrock AgentCore Developer Guide, AWS. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-rate-limits.html
- [68] Rate limit metrics. Amazon Bedrock AgentCore Developer Guide, AWS. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-rate-limits-metrics.html
- [192] Quotas for the bedrock-runtime endpoint (requesting a quota increase). Amazon Bedrock User Guide, AWS; accessed 9 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-runtime.html
- [69] Temporal policies. Amazon Bedrock AgentCore Developer Guide, AWS. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-temporal.html
- [70] Authoring temporal policies. Amazon Bedrock AgentCore Developer Guide, AWS. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-temporal-authoring.html
- [1] Amazon Bedrock pricing. AWS. https://aws.amazon.com/bedrock/pricing/
- [187] AWS Price List bulk offer, AmazonBedrock (offer version 20261102165015, Guardrails text units, us-east-1). AWS; accessed 5 November 2026. https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/index.json
- [174] Amazon Bedrock (service tiers, Provisioned Throughput, Guardrails, Advanced Prompt Optimization). Generative AI inference architecture and best practices on AWS, AWS Prescriptive Guidance; accessed 5 November 2026. https://docs.aws.amazon.com/prescriptive-guidance/latest/gen-ai-inference-architecture-and-best-practices-on-aws/amazon-bedrock.html
- [205] Use the InvokeGuardrailChecks API in your application. Amazon Bedrock User Guide, AWS; accessed 9 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-use-invoke-guardrail-checks.html
- [188] Amazon Bedrock Guardrails now supports Standard tier for contextual grounding checks. AWS What’s New, October 2026; accessed 5 November 2026. https://aws.amazon.com/about-aws/whats-new/2026/10/bedrock-guardrails-grounding-standard/

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}
