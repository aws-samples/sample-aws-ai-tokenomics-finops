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

## Citations

- [1] Amazon Bedrock pricing. AWS. https://aws.amazon.com/bedrock/pricing/
- [22] Cross-region inference. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html
- [11] AGENTCOST02-BP01: Select cost-appropriate service tiers. AWS Well-Architected Agentic AI Lens. https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentcost02-bp01.html
- [37] Batch inference. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference.html
- [193] Capacity and Performance (batch processing limits). Amazon Bedrock User Guide, AWS; accessed 9 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/capacity-limits-cost-optimization.html
- [130] Supported Regions and models for batch inference. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference-supported.html
- [127] Models at a glance. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html
- [128] Claude Sonnet 5 model card, Service Tiers. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5.html#model-card-anthropic-claude-sonnet-5-tiers
- [129] GPT-5.6 Sol model card, Service Tiers and pricing. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-sol.html
- [146] Claude Haiku 5.5 model card (features, pricing and long-context note). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html
- [149] Claude Sonnet 5.5 model card (feature support). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html
- [162] Claude Opus 5.5 model card (reasoning and effort default). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5-5.html
- [183] Claude Sonnet 4.6 model card (Service Tiers). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html
- [184] Claude Opus 4.8 model card (Service Tiers). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-4-8.html
- [147] GPT-6 Sol model card (pricing, short and long context). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-sol.html
- [185] GPT-6 Astra model card (Service Tiers and Ultrafast pricing). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-astra.html
- [148] GPT-6.1 Sol model card (features and pricing). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-1-sol.html
- [65] Service tiers for optimizing performance and cost. Amazon Bedrock documentation. https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html
- [174] Amazon Bedrock (service tiers, Provisioned Throughput, Guardrails, Advanced Prompt Optimization). Generative AI inference architecture and best practices on AWS, AWS Prescriptive Guidance; accessed 5 November 2026. https://docs.aws.amazon.com/prescriptive-guidance/latest/gen-ai-inference-architecture-and-best-practices-on-aws/amazon-bedrock.html
- [26] Supported Regions and models for inference profiles. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
- [150] AWS Price List bulk offer, AmazonBedrockFoundationModels (offer version 20261012084008, us-east-1 Standard rows for Claude Sonnet 5.5 and Claude Haiku 5.5, and Claude Opus 5.5 cache-read rows). AWS; accessed 5 November 2026, cache-read rows re-checked 9 November 2026. https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/index.json
- [27] Securing Amazon Bedrock cross-region inference: geographic and global. AWS Machine Learning Blog. https://aws.amazon.com/blogs/machine-learning/securing-amazon-bedrock-cross-region-inference-geographic-and-global/
- [23] Troubleshooting API error codes. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/troubleshooting-api-error-codes.html
- [24] On-demand inference. Amazon Nova User Guide, AWS. https://docs.aws.amazon.com/nova/latest/nova2-userguide/on-demand-inference.html
- [186] Inference profiles with limited model selection. Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-limited-model-selection.html

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}
