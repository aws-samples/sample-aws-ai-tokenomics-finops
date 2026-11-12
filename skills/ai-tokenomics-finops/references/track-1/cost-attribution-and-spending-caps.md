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

Glob sets: agent-config = **/.kiro/** **/.claude/** **/.codex/** **/.opencode/** **/.agents/** **/AGENTS.md **/CLAUDE.md **/.mcp.json **/mcp.json **/opencode.json; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}; docs = **/*.{md,mdx,rst,adoc,txt}

Citations for the reader (not needed to answer): `references/track-1/citations/cost-attribution-and-spending-caps.md`
