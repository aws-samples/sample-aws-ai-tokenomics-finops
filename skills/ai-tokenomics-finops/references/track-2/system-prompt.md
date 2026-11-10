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

## Citations

- [83] AGENTCOST02-BP02: Cost optimize token consumption through efficient prompt engineering. AWS Well-Architected Agentic AI Lens. https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentcost02-bp02.html
- [5] Prompt caching. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html
- [38] Effective context engineering for AI agents. Anthropic Engineering, Sep 2025. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- [134] Prompting best practices for Claude 4 models. Anthropic documentation. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices
- [174] Amazon Bedrock (service tiers, Provisioned Throughput, Guardrails, Advanced Prompt Optimization). Generative AI inference architecture and best practices on AWS, AWS Prescriptive Guidance; accessed 5 November 2026. https://docs.aws.amazon.com/prescriptive-guidance/latest/gen-ai-inference-architecture-and-best-practices-on-aws/amazon-bedrock.html
- [171] Shorten prompts (Advanced Prompt Optimization). Amazon Bedrock User Guide, AWS; accessed 5 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/advanced-prompt-optimization-shorten.html
- [172] Amazon Bedrock Advanced Prompt Optimization now supports prompt shortening. AWS What’s New, October 2026; accessed 5 November 2026. https://aws.amazon.com/about-aws/whats-new/2026/10/bedrock-prompt-optimization-shortening/
- [1] Amazon Bedrock pricing. AWS. https://aws.amazon.com/bedrock/pricing/
- [6] Prompt caching. Anthropic documentation. https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- [131] Construct and store reusable prompts with Prompt management in Amazon Bedrock. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-management.html
- [132] Optimize a prompt. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-management-optimize.html
- [133] GENOPS03-BP01: Implement prompt template management. AWS Well-Architected Generative AI Lens. https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/genops03-bp01.html

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; docs = **/*.{md,mdx,rst,adoc,txt}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}
