<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Know how your coding agent is metered

- Track: Track 1 - AI Coding Assistant · Model Inference
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#know-how-your-fleet-is-metered
- What it saves: Enabler — turns a quota limit into a decision you see coming. It saves nothing directly on the bill, but it keeps that limit from becoming a paid-capacity call made under pressure.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `qsh-q1` Do you know how your AI coding agent meters usage?

- Fully covered looks like: Confirm which meter you are on before you build any monitoring, because the meter decides what there is to monitor. Pay-as-you-go platforms meter tokens and requests per unit time. Seat subscriptions usually meter a rolling time window. Credit plans meter a monthly pool.
- Evidence: Which meter the coding agent runs on: Bedrock tokens (agent configured for Amazon Bedrock), Kiro credits, or a plan allowance.
- Search: agent-config, config, docs files for `CLAUDE_CODE_USE_BEDROCK`, `bedrock`, `\bkiro\b.*(credit|plan|pool)`, `credit (pool|sharing)`

## `qsh-q2` Do you know what happens when the quota runs out: a hard stop, a queue, or paid overage?

- Fully covered looks like: Confirm what happens at the limit before you reach it. Name one approver for paid overage or a budget increase, and define the response time.
- Evidence: Documented behaviour at the limit: Bedrock throttling, a Kiro credit block, or overage.
- Search: docs, agent-config files for `quota`, `throttl`, `overage`, `(credit|usage|rate) limit`
- Usually only the user knows: search, then ask.

## `qsh-q3` Do you monitor that meter and alert before it empties?

- Fully covered looks like: Alert on the metric you identified as your meter in the previous section, not a different one. Set the threshold so the headroom left when it fires covers the time it takes to get a budget increase approved. The slower that approval takes, the earlier the alert needs to fire.
- Evidence: Alarms or alerts on Bedrock quota or token use, or on credit use, before the limit.
- Search: iac, config, docs files for `AWS::CloudWatch::Alarm`, `aws_cloudwatch_metric_alarm`, `AWS/Bedrock`, `(Input|Output)TokenCount`, `AWS::Budgets::Budget`, `aws_budgets_budget`, `service.?quota`

## Citations

- [52] Claude Code on Amazon Bedrock. Claude Code documentation. https://code.claude.com/docs/en/amazon-bedrock
- [103] Use ChatGPT Work and Codex with Amazon Bedrock. OpenAI Codex documentation. https://developers.openai.com/codex/amazon-bedrock
- [195] Share credits across your team with credit pooling. Kiro changelog; accessed 9 November 2026. https://kiro.dev/changelog/general/credit-pooling/
- [58] Pricing. Kiro. https://kiro.dev/pricing/
- [196] Share Kiro credits across your team with credit pooling. Kiro Blog; accessed 9 November 2026. https://kiro.dev/blog/credit-pooling/
- [156] Set a cap on overage spend, or pre-pay for it. Kiro Blog; accessed 5 November 2026. https://kiro.dev/blog/cap-prepay-overage/
- [175] Amazon Bedrock now supports observability of First Token Latency and Quota Consumption. AWS What’s New, March 2026; accessed 5 November 2026. https://aws.amazon.com/about-aws/whats-new/2026/03/amazon-bedrock-observability-ttft-quota/
- [192] Quotas for the bedrock-runtime endpoint (requesting a quota increase). Amazon Bedrock User Guide, AWS; accessed 9 November 2026. https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-runtime.html

Glob sets: agent-config = **/.kiro/** **/.claude/** **/.codex/** **/.opencode/** **/.agents/** **/AGENTS.md **/CLAUDE.md **/.mcp.json **/mcp.json **/opencode.json; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}; docs = **/*.{md,mdx,rst,adoc,txt}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**
