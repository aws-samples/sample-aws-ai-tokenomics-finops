<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Run an open-weight model behind your coding-agent harness

- Track: Track 1 - AI Coding Assistant · Agent Harness
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#run-an-open-weight-model-behind-your-coding-agent-harness
- What it saves: Frontier per-token rates on the work a cheaper open-weight model proves it can solve. Developers keep the harness they already use, and a governed gateway in your account carries the switch. The saving is real only after your own benchmark shows a lower cost per solved task, because a cheaper model that fails or loops can cost more.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `owm-q1` Have you measured cost per solved task, not price per token, for each candidate open-weight model and harness pair on your own repositories and tasks?

- Fully covered looks like: Benchmark each candidate model and harness pair on the measure set out in Compare models on cost per solved task, not price per token. Build the task suite from your own repositories, because a public benchmark rarely matches your codebase, languages or review standards.
- Evidence: Benchmarks of cost per solved task for open-weight model and harness pairs on the team's own tasks.
- Search: docs, config, code files for `cost per (solved|successful) task`, `benchmark|swe-?bench|eval(uation)?s?\b`, `qwen|deepseek|llama|mistral|gpt-oss|kimi|minimax`

## `owm-q2` Have you reviewed the gateway, data-handling, and model-provenance path for the open-weight model, including whether it runs in your account on Amazon Bedrock or through a third-party API?

- Fully covered looks like: Start with the managed open-weight models in Amazon Bedrock, which bill per token and need no infrastructure of your own. The launch list includes coding-oriented models such as Kimi K2.5, Qwen3 Coder Next and GLM 4.7 (Amazon Bedrock adds six open weights models [135]).
- Evidence: The gateway and data path to the open-weight model: in-account Bedrock or a third-party API.
- Search: config, iac, agent-config, docs files for `litellm|gateway|proxy`, `(ANTHROPIC|OPENAI)_BASE_URL|base_url`, `openai\.gpt-oss|qwen\.|deepseek\.|mistral\.|meta\.llama`

## `owm-q3` Have you confirmed that the chosen model's tool calling works cleanly through your gateway into the specific harness you run?

- Fully covered looks like: Tool calling, also called function calling, is where a model swap usually breaks. Each harness expects its own tool-call format, and a gateway that translates between formats can drop or mangle calls.
- Evidence: A check that tool calling works through the gateway into the harness in use.
- Search: docs, code files for `tool.?call(ing)?|function.?call(ing)?`, `litellm|gateway`
- Usually only the user knows: search, then ask.

## Citations

- [139] Terminal-Bench 2.1. Terminal-Bench news. https://www.tbench.ai/news/terminal-bench-2-1
- [144] Terminal-Bench leaderboard (model and agent pairs by resolution rate, cost and tokens). Stanford, Harbor and Laude Institute; accessed 19 October 2026. https://www.tbench.ai/
- [140] Does your harness matter more than your model? aistack blog, imec. https://aistack.imec-int.com/blog/harness-cost
- [141] Harness or Model? Isolating the Harness Effect. arXiv:2609.11987, September 2026. https://arxiv.org/abs/2609.11987
- [138] Benchmarking customized models on Amazon Bedrock using LLMPerf and LiteLLM. AWS Machine Learning Blog, 13 March 2025. https://aws.amazon.com/blogs/machine-learning/benchmarking-customized-models-on-amazon-bedrock-using-llmperf-and-litellm/
- [135] Amazon Bedrock adds support for six fully-managed open weights models. AWS What's New, 10 February 2026. https://aws.amazon.com/about-aws/whats-new/2026/02/amazon-bedrock-adds-support-six-open-weights-models/
- [145] Chat Completions API. Amazon Bedrock User Guide, AWS; accessed 19 October 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html
- [136] Set up OpenAI ChatGPT Codex with LiteLLM on Amazon ECS and Amazon Bedrock. AWS Machine Learning Blog, 3 September 2026. https://aws.amazon.com/blogs/machine-learning/set-up-openai-chatgpt-codex-with-litellm-on-amazon-ecs-and-amazon-bedrock/
- [137] sample-litellm-bedrock-gateway-on-eks, a LiteLLM to Amazon Bedrock model gateway on Amazon EKS. AWS Samples on GitHub. https://github.com/aws-samples/sample-litellm-bedrock-gateway-on-eks
- [45] Budgets and rate limits. LiteLLM proxy documentation. https://docs.litellm.ai/docs/proxy/users
- [142] CAISI's assessment of Z.ai's GLM-5.3 cyber capabilities. Center for AI Standards and Innovation, NIST, 17 September 2026. https://www.nist.gov/news-events/news/2026/09/caisis-assessment-zais-glm-53-cyber-capabilities
- [143] GLM-5.3 and the spread of advanced cyber capabilities. Anthropic Frontier Red Team, 29 September 2026. https://www.anthropic.com/research/glm-5-3-and-the-spread-of-advanced-cyber-capabilities
- [51] Use Custom model import to import a customized model into Amazon Bedrock. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-import-model.html
- [52] Claude Code on Amazon Bedrock. Claude Code documentation. https://code.claude.com/docs/en/amazon-bedrock
- [103] Use ChatGPT Work and Codex with Amazon Bedrock. OpenAI Codex documentation. https://developers.openai.com/codex/amazon-bedrock
- [73] Cut costs with Claude Code. LiteLLM documentation. https://docs.litellm.ai/docs/tutorials/claude_code_cut_costs

Glob sets: docs = **/*.{md,mdx,rst,adoc,txt}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}; code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; agent-config = **/.kiro/** **/.claude/** **/.codex/** **/.opencode/** **/.agents/** **/AGENTS.md **/CLAUDE.md **/.mcp.json **/mcp.json **/opencode.json
