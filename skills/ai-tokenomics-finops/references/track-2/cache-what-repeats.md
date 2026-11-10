<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Cache what repeats

- Track: Track 2 - Purpose-Built Agentic AI Application · Model Inference
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#cache-what-repeats
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: About 90% to 95% off repeated-prefix input (cache reads at 0.1x or 0.05x base, by model), the single largest per-call saving for agentic workloads that re-send system prompts and tool definitions on every turn.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `cwr-q1` Is prompt caching on, with the stable content placed first?

- Fully covered looks like: Turn caching on and order the request so the stable content comes first: system prompt, then tool schemas, then reference documents, then the variable user turn. A read bills at 0.1× or 0.05× the input price, depending on the model, and a 5-minute write at 1.25×, so one re-read already pays for the write.
- Evidence: Prompt caching enabled (cache points) with the stable system prompt and tools first.
- Search: code files for `cachePoint|cache_control|cacheConfig|prompt_?caching`, `system\s*[=:]`

## `cwr-q2` Have you verified caching works, and do you track the hit rate?

- Fully covered looks like: Check that cacheReadInputTokens is non-zero from the second call of a session, then chart cache hit rate = cache reads / (cache reads + cache writes + uncached input) weekly per inference profile and alert when it drops.
- Evidence: Cache hits verified and tracked: cache read and write token counts, invocation logging.
- Search: code, iac, docs files for `cache_?read_?input_?tokens|cacheReadInputTokens|cacheWriteInputTokens|CacheRead`, `hit rate`, `invocation logging|loggingConfig|ModelInvocationLogging`

## `cwr-q3` Does your cache TTL match how often your sessions call?

- Fully covered looks like: Use the 1-hour TTL (2× write) when users can pause for more than five minutes between calls, and the 5-minute default (1.25× write) for automated sessions that finish in seconds. A hit refreshes the TTL at no charge.
- Evidence: A cache TTL chosen to match how often sessions call.
- Search: code, config files for `\bttl\b`, `\b(5m|1h)\b`

## Citations

- [1] Amazon Bedrock pricing. AWS. https://aws.amazon.com/bedrock/pricing/
- [3] GENCOST03-BP03: Implement prompt caching. AWS Well-Architected Generative AI Lens. https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/gencost03-bp03.html
- [5] Prompt caching. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html
- [6] Prompt caching. Anthropic documentation. https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- [150] AWS Price List bulk offer, AmazonBedrockFoundationModels (offer version 20261012084008, us-east-1 Standard rows for Claude Sonnet 5.5 and Claude Haiku 5.5, and Claude Opus 5.5 cache-read rows). AWS; accessed 5 November 2026, cache-read rows re-checked 9 November 2026. https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/index.json
- [129] GPT-5.6 Sol model card, Service Tiers and pricing. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-sol.html
- [148] GPT-6.1 Sol model card (features and pricing). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-1-sol.html
- [191] GPT-6.1 Terra model card (pricing and service tiers). Amazon Bedrock User Guide, AWS; accessed 9 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-1-terra.html
- [149] Claude Sonnet 5.5 model card (feature support). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html
- [115] Reducing cost and improving performance with Claude Platform. Anthropic, Sep 2026. https://claude.com/blog/reducing-cost-and-improving-performance-with-claude-platform
- [173] Introducing explicit prompt caching for OpenAI models on Amazon Bedrock. AWS Machine Learning Blog; accessed 5 November 2026. https://aws.amazon.com/blogs/machine-learning/introducing-explicit-prompt-caching-for-openai-gpt-5-6-models-on-amazon-bedrock/
- [181] Lower cost and latency for AI using Amazon ElastiCache as a semantic cache with Amazon Bedrock. AWS Database Blog; accessed 5 November 2026. https://aws.amazon.com/blogs/database/lower-cost-and-latency-for-ai-using-amazon-elasticache-as-a-semantic-cache-with-amazon-bedrock/
- [182] Implementing a semantic cache with ElastiCache for Valkey. Amazon ElastiCache User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/semantic-caching-implementation.html
- [189] Incident Report: Prompt Cache Invalidation for Claude Code on Bedrock Invoke. LiteLLM blog, July 2026; accessed 8 November 2026. https://docs.litellm.ai/blog/bedrock-invoke-prompt-caching-incident

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; docs = **/*.{md,mdx,rst,adoc,txt}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}
