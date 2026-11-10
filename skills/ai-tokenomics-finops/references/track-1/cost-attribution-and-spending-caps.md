<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Cost attribution and spending caps

- Track: Track 1 - AI Coding Assistant · Model Inference
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#cost-attribution-and-spending-caps
- What it saves: Enabler — turns one shared invoice into spend you can see per user and per team. It saves nothing directly, but it's what lets a spending cap stop an overspend at the moment of the request instead of on next month's bill — and every other lever in this track needs that same visibility to work.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `scap-q1` Do you understand your team's usage pattern and break down spend at user, team, and department level?

- Fully covered looks like: Start from the path between the coding agent and its model. Use coding-agent telemetry for activity measures, and use the billing plane for charged inference.
- Evidence: Spend broken down by user, team and department: agent telemetry, per-team inference profiles, cost allocation tags.
- Search: agent-config, iac, config files for `CLAUDE_CODE_ENABLE_TELEMETRY`, `OTEL_`, `application-inference-profile|ApplicationInferenceProfile|create_inference_profile`, `cost.?allocation`

## `scap-q2` Do you have organisation-level spend caps and per-user limits enforced?

- Fully covered looks like: Set organisation-level per-user limits with rolling reset windows and fail requests once a budget is crossed, so the stop happens on the request path rather than on the invoice. Amazon Bedrock has no native per-user spend limit, so a gateway is where this is enforced.
- Evidence: Organisation spend caps and per-user limits that are enforced: gateway budgets, Kiro limits, AWS Budgets actions.
- Search: iac, config, docs files for `max_budget|budget_duration`, `(rpm|tpm)_limit|rate.?limit`, `AWS::Budgets::Budget|aws_budgets_budget`, `per.?user (limit|cap|budget)`

## `scap-q3` Do you have a defined process for developers to request more quota when a task calls for it, a named approver, and a short turnaround?

- Fully covered looks like: A usage limit's job is to make cost visible, not restrict productivity — that visibility is what makes developers more efficient and builds a cost-aware culture (FinOps Foundation, FinOps for AI [41]). Set it to cover most normal work, and pair it with an escalation path defined before anyone needs it: a way to request more, a named approver, and a short turnaround.
- Evidence: A documented way to request more quota, with a named approver and turnaround.
- Search: docs files for `request (more|a higher|additional) (quota|limit|credits?)`, `approv(er|al)`
- Usually only the user knows: search, then ask.

## Citations

- [74] Coding agents insights. Amazon CloudWatch User Guide, AWS. https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/coding-agents-insights.html
- [104] Set up OpenTelemetry for OpenAI Codex. Amazon CloudWatch User Guide, AWS. https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/coding-agents-codex.html
- [75] Track Amazon Bedrock costs by caller identity with IAM-based cost allocation. AWS Cloud Financial Management Blog. https://aws.amazon.com/blogs/aws-cloud-financial-management/track-amazon-bedrock-costs-by-caller-identity-with-iam-based-cost-allocation/
- [103] Use ChatGPT Work and Codex with Amazon Bedrock. OpenAI Codex documentation. https://developers.openai.com/codex/amazon-bedrock
- [76] Send Claude Code gateway telemetry to CloudWatch. Amazon CloudWatch User Guide, AWS. https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/coding-agents-claude-code-gateway.html
- [45] Budgets and rate limits. LiteLLM proxy documentation. https://docs.litellm.ai/docs/proxy/users
- [73] Cut costs with Claude Code. LiteLLM documentation. https://docs.litellm.ai/docs/tutorials/claude_code_cut_costs
- [56] Track team usage with analytics. Claude Code documentation. https://code.claude.com/docs/en/analytics
- [58] Pricing. Kiro. https://kiro.dev/pricing/
- [54] Monitoring. Claude Code documentation. https://code.claude.com/docs/en/monitoring-usage
- [57] Usage and Cost API. Claude Platform documentation. https://platform.claude.com/docs/en/manage-claude/usage-cost-api
- [72] Claude apps gateway spend limits. Claude Code documentation. https://code.claude.com/docs/en/claude-apps-gateway-spend-limits
- [42] Introducing Claude apps gateway for AWS. AWS Machine Learning Blog, Jul 2026. https://aws.amazon.com/blogs/machine-learning/introducing-claude-apps-gateway-for-aws/
- [77] Multi-provider generative AI gateway on AWS. AWS Solutions Library. https://docs.aws.amazon.com/solutions/multi-provider-generative-ai-gateway-on-aws/
- [118] Configuring budget actions. AWS Cost Management User Guide, AWS. https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-controls.html
- [119] Getting started with AWS Cost Anomaly Detection. AWS Cost Management User Guide, AWS. https://docs.aws.amazon.com/cost-management/latest/userguide/getting-started-ad.html
- [41] FinOps for AI Working Group. FinOps Foundation (Linux Foundation). https://www.finops.org/wg/finops-for-ai/
- [120] Requesting a quota increase. Service Quotas User Guide, AWS. https://docs.aws.amazon.com/servicequotas/latest/userguide/request-quota-increase.html
- [121] Quotas for Amazon Bedrock. Amazon Bedrock User Guide, AWS. https://docs.aws.amazon.com/bedrock/latest/userguide/quotas.html

Glob sets: agent-config = **/.kiro/** **/.claude/** **/.codex/** **/.opencode/** **/.agents/** **/AGENTS.md **/CLAUDE.md **/.mcp.json **/mcp.json **/opencode.json; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}; docs = **/*.{md,mdx,rst,adoc,txt}
