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

Glob sets: docs = **/*.{md,mdx,rst,adoc,txt}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}; code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; agent-config = **/.kiro/** **/.claude/** **/.codex/** **/.opencode/** **/.agents/** **/AGENTS.md **/CLAUDE.md **/.mcp.json **/mcp.json **/opencode.json

Citations for the reader (not needed to answer): `references/track-1/citations/run-an-open-weight-model-behind-your-coding-agent-harness.md`
