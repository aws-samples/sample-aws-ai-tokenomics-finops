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

## Citations

- [1] Amazon Bedrock pricing. AWS. https://aws.amazon.com/bedrock/pricing/
- [93] Model lifecycle policy for models launched before 7 September 2026. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.html
- [16] Model lifecycle (models launched on or after 7 September 2026). Amazon Bedrock User Guide, AWS; accessed 9 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle.html
- [150] AWS Price List bulk offer, AmazonBedrockFoundationModels (offer version 20261012084008, us-east-1 Standard rows for Claude Sonnet 5.5 and Claude Haiku 5.5, and Claude Opus 5.5 cache-read rows). AWS; accessed 5 November 2026, cache-read rows re-checked 9 November 2026. https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/index.json
- [146] Claude Haiku 5.5 model card (features, pricing and long-context note). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html
- [194] OpenAI GPT-6.1 Terra is now generally available on Amazon Bedrock. AWS What’s New, October 2026; accessed 9 November 2026. https://aws.amazon.com/about-aws/whats-new/2026/10/openai-gpt-6-1-terra-on-amazon-bedrock/
- [191] GPT-6.1 Terra model card (pricing and service tiers). Amazon Bedrock User Guide, AWS; accessed 9 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-1-terra.html
- [148] GPT-6.1 Sol model card (features and pricing). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-1-sol.html
- [7] Cost optimization. AWS Prescriptive Guidance, Agentic AI on serverless. https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/cost-optimization.html
- [46] Optimizing cost for deploying Amazon Q. AWS Cloud Financial Management Blog, Jun 2025. https://aws.amazon.com/blogs/aws-cloud-financial-management/optimizing-cost-for-deploying-amazon-q/
- [4] AGENTCOST02: Model costs. AWS Well-Architected Agentic AI Lens. https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentcost02.html
- [32] Gateway inference targets. Amazon Bedrock AgentCore Developer Guide, AWS. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-targets-inference.html
- [48] Router: load balancing and routing strategies. LiteLLM documentation. https://docs.litellm.ai/docs/routing
- [49] Conditional routing. Portkey documentation. https://portkey.ai/docs/product/ai-gateway/conditional-routing
- [112] Intelligent route: model selection. vLLM Semantic Router documentation. https://vllm-sr.ai/docs/v0.1/tutorials/intelligent-route/model-selection/overview/
- [113] Switchyard: smart model routing. NVIDIA NeMo, GitHub. https://github.com/NVIDIA-NeMo/Switchyard
- [114] Portal by Spotify cut my Claude Code token usage by 90%. Spotify Engineering, Sep 2026. https://engineering.atspotify.com/2026/9/portal-by-spotify-cut-my-claude-code-token-usage-by-90
- [28] Intelligent prompt routing. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-routing.html
- [31] Amazon Bedrock Intelligent Prompt Routing. AWS. https://aws.amazon.com/bedrock/intelligent-prompt-routing/
- [149] Claude Sonnet 5.5 model card (feature support). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html
- [33] Inference connector targets. Amazon Bedrock AgentCore Developer Guide, AWS. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-inference-connector.html
- [35] Service quotas. Amazon Bedrock AgentCore Developer Guide, AWS. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/bedrock-agentcore-limits.html
- [68] Rate limit metrics. Amazon Bedrock AgentCore Developer Guide, AWS. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-rate-limits-metrics.html
- [62] Model deprecations. Claude Platform documentation. https://platform.claude.com/docs/en/about-claude/model-deprecations
- [192] Quotas for the bedrock-runtime endpoint (requesting a quota increase). Amazon Bedrock User Guide, AWS; accessed 9 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-runtime.html

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}; docs = **/*.{md,mdx,rst,adoc,txt}
