# AI Tokenomics FinOps assessment — Track 2 - Purpose-Built Agentic AI Application

Agent-assisted static review (Level 1) of sample-bedrock-app, 2026-11-10. Dated, not attributed.

> Published as-is under MIT-0; this is not official AWS documentation. Prices and features change, so check the linked AWS pages before relying on a figure. This report was drafted by an AI agent from a read-only review of the workspace and the user's answers; check each answer before acting on it.

Coverage: 1 fully covered · 4 partially · 23 not covered · 1 N/A · 4 unknown (29/33 answered).

Out of scope (excluded from every count above): Self-host or distill when volume justifies it, Retrieval.

## Gaps to address

In runbook order. This list is not ranked or prioritised.

### Know what you spend and what it buys

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#know-what-you-spend
What it saves: Visibility first. It saves nothing directly on the bill, but every other lever in this layer needs this decomposition to tell you whether it worked.

- `kwys-q1` [Partially] Do you know your total agent spend and how it is constructed?
  Source: iac · Confidence: high · Evidence: infra/template.yaml:28-39, docs/design.md:7-8, app/agent.py:25-33 — Account-level monthly budget alert and monthly bill review exist, but token usage is never read from responses, so spend is not decomposed into its terms.
- `kwys-q2` [Not covered] Do you track cost per successful task, and gate releases on it?
  Source: user · Confidence: high · Evidence: docs/design.md:4 — User said there is no evaluation set and cost per resolved ticket is not measured.
- `kwys-q3` [Partially] Is every dollar attributed to the team or workload that caused it?
  Source: iac · Confidence: medium · Evidence: infra/template.yaml:12-14, app/agent.py:14, app/agent.py:26 — Lambda carries team/app tags (user confirmed no chargeback beyond tags), but Bedrock is called by raw model ID with no application inference profile or requestMetadata.

### Route to the right model

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#route-to-the-right-model
What it saves: Blended bill under half the frontier-only baseline through tiered routing (worked example above). Lifecycle audit prevents Legacy pricing surprises, and rushed migrations when a Legacy period is as short as 45 days.

- `rtm-q1` [Not covered] Does each request go to the cheapest model that meets your quality bar?
  Source: code · Confidence: high · Evidence: app/agent.py:14, app/nightly_summaries.py:15, docs/design.md:4 — Every request, including simple nightly ticket summaries, goes to one frontier Opus model with no routing.

### Route to the right price

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#route-to-the-right-price
What it saves: 50% on batch-eligible work, plus up to approximately 10% on a Global cross-region profile; Flex adds the same 50% on queue-tolerant traffic only where the model card lists it.

- `rtp-q1` [Not covered] Do you choose Standard or batch deliberately for each workload?
  Source: code · Confidence: high · Evidence: app/nightly_summaries.py:1-3, app/nightly_summaries.py:13-18 — The deadline-free nightly summary job makes one synchronous on-demand call per ticket; no batch job or service tier is used anywhere.

### Cache what repeats

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#cache-what-repeats
What it saves: About 90% to 95% off repeated-prefix input (cache reads at 0.1x or 0.05x base, by model), the single largest per-call saving for agentic workloads that re-send system prompts and tool definitions on every turn.

- `cwr-q1` [Not covered] Is prompt caching on, with the stable content placed first?
  Source: code · Confidence: high · Evidence: app/agent.py:16-18, app/agent.py:25-31 — The ~6,000-token system prompt and 16 tool specs are resent identically every call, but no cachePoint is set.
- `cwr-q2` [Not covered] Have you verified caching works, and do you track the hit rate?
  Source: docs · Confidence: high · Evidence: docs/design.md:9, app/agent.py:32-34 — Caching is not enabled, cache token counts are never read, and Bedrock invocation logging is off.
- `cwr-q3` [Not covered] Does your cache TTL match how often your sessions call?
  Source: code · Confidence: high · Evidence: app/agent.py:25-31 — No cache and no TTL choice; web-chat users pausing between turns would suit a 1-hour TTL.

### Set reasoning effort per call

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#set-reasoning-effort-per-call
What it saves: Fewer billed thinking tokens on the steps that do not need deep reasoning. Thinking is billed as output, so the saving lands on the most expensive token type.

- `eff-q1` [Not covered] Do you set reasoning effort for each type of step, rather than taking the model default?
  Source: code · Confidence: medium · Evidence: app/agent.py:25-31, app/nightly_summaries.py:14-18 — Neither call sets reasoning effort or a thinking budget (no additionalModelRequestFields); both take the model default for every step type.
- `eff-q2` [Not covered] Do you compare output tokens per successful task before you change an effort level?
  Source: user · Confidence: high · Evidence: docs/design.md:4 — User said there is no evaluation set, so output tokens per successful task are not compared.

### System prompt

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#system-prompt
What it saves: Up to about 90% of the prompt’s share of input when a trimmed prompt is also cache-stable (worked example above). The trim alone saves in proportion to the tokens removed, on every call of every task.

- `sp-q1` [Not covered] Is your system prompt as lean as it can be?
  Source: code · Confidence: high · Evidence: app/agent.py:16-18, docs/design.md:6, docs/support-policy.md:3-4 — The whole ~6,000-token support policy is sent as the system prompt on every model call, including every tool round.
- `sp-q2` [Partially] Is your system prompt versioned and cache-stable?
  Source: code · Confidence: medium · Evidence: app/agent.py:17-18, app/agent.py:27 — The prompt is byte-stable with no per-call values, but it has no version, token count or per-version cost tracking beyond the file in source control.

### Context

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#context-budget
What it saves: Keeps per-round input bounded, so context cost tracks the task rather than the age of the session.

- `csl-q1` [Not covered] Do you measure and budget what each request’s context contains?
  Source: code · Confidence: high · Evidence: app/agent.py:22-31 — No token counting, context budget or truncation; full history, system prompt and all tool specs go into every request unmeasured.
- `crs-q3` [Not covered] Are tool and runtime outputs bounded before they enter the context?
  Source: code · Confidence: medium · Evidence: app/tools.py:21-23, app/agent.py:36-37 — Tool results are appended to the context verbatim with no size bound or output contract; run_tool is a stub, so real result sizes are unknown.

### Memory

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#design-memory-and-compaction-as-architecture
What it saves: Sub-linear history cost: the context sent per call stops growing with the age of the session, and compaction at boundaries keeps the cache discount intact.

- `csl-q2` [Not covered] Have you chosen how history is kept, instead of append-only?
  Source: code · Confidence: high · Evidence: app/agent.py:21-23, app/agent.py:33, app/agent.py:37 — History is append-only and the full conversation, including tool rounds, is resent every turn.
- `csl-q3` [Not covered] Do you prune at natural boundaries, without breaking the cache every turn?
  Source: code · Confidence: high · Evidence: app/agent.py:22 — Nothing trims, summarises or compacts history at any boundary.

### Tool design

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#budget-the-tool-definition-weight
What it saves: Lowers the fixed capability tax and prevents runtime output from becoming recurring context.

- `crs-q1` [Not covered] Do you keep a costed inventory of tools, skills and MCP servers?
  Source: code · Confidence: medium · Evidence: app/tools.py:3-19 — There is a list of 16 tool names in code, but no inventory with owner, definition tokens or measured runtime cost.
- `crs-q2` [Not covered] Does each call see only the tools it needs?
  Source: code · Confidence: high · Evidence: app/tools.py:1, app/agent.py:29 — All 16 tool specs are sent on every call regardless of the question's intent.

### Orchestration

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#bound-the-reasoning-loop
What it saves: Bounds the orchestration multiplier, removing avoidable calls and keeping coordination proportional to useful work.

- `bso-q1` [Not covered] Do loops have termination and retry limits, with rules where rules suffice?
  Source: code · Confidence: high · Evidence: app/agent.py:24, app/agent.py:34-36 — The tool loop is while True with only a completion exit; no iteration cap, session token budget or retry policy.
- `bso-q3` [Not covered] Do you measure the full cost of a workflow, including retries and coordination?
  Source: code · Confidence: high · Evidence: app/agent.py:25-33 — Per-call usage is never read, so the cost of a full answer across tool rounds is not measured.

### Guardrails and limits

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#enforce-per-user-ceilings-at-the-gateway
What it saves: Caps aggregate and per-caller consumption, preventing concurrent workflows or one shared caller from multiplying otherwise controlled cost.

- `ceb-q1` [Not covered] Are concurrency, queue depth and fan-out bounded in dispatcher code?
  Source: iac · Confidence: medium · Evidence: infra/template.yaml:5-14, app/nightly_summaries.py:13-18 — The Lambda sets no reserved concurrency and the code has no concurrency or queue limits; the nightly job is a serial loop over an unbounded ticket list.
- `ceb-q2` [Not covered] Are request, token and connection limits enforced per caller at the gateway?
  Source: iac · Confidence: high · Evidence: infra/template.yaml:28, app/agent.py:21 — No gateway, usage plan or per-user limit; user_id is passed in but never used, and the only control is an account-level budget alert.

### Observability

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#audit-your-orchestration-for-hidden-invocations
What it saves: Eliminates work no valid task required, exposing orphaned loops, retry storms and forgotten background callers before they become persistent traffic.

- `teui-q1` [Not covered] Can you trace every model and tool call to its caller and task?
  Source: code · Confidence: high · Evidence: app/agent.py:25-31, app/nightly_summaries.py:14-18, docs/design.md:9 — No requestMetadata, tracing or correlation IDs on calls, and Bedrock model invocation logging is not enabled.
- `teui-q2` [Not covered] Do you reconcile invocations against requested work to find orphans?
  Source: docs · Confidence: medium · Evidence: docs/design.md:9 — With invocation logging off and no task ledger there are no invocation records to reconcile against requested work.
- `teui-q3` [Partially] Do you alert on calls with no task, after completion, or over budget?
  Source: iac · Confidence: medium · Evidence: infra/template.yaml:28-39 — Only an account-level monthly budget alert at 80%; no alerts on unmatched, post-completion or over-limit calls and no anomaly monitor.

### Show the user what their session costs

Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#show-the-user-what-their-session-costs
What it saves: Qualitative — recruits every user into the cost loop instead of leaving optimisation entirely to the platform team.

- `cost-q1` [Not covered] Does your interface show users what their session costs?
  Source: user · Confidence: high · Evidence: User said the web chat does not show users anything about cost or usage.
- `cost-q2` [Not covered] Is that cost shown during the session, while users can still act?
  Source: user · Confidence: high · Evidence: User said the web chat shows no cost or usage, so nothing is shown during the session.

## Full answer log

### Model Inference · Know what you spend and what it buys — Gap

- `kwys-q1` [Partially] Do you know your total agent spend and how it is constructed?
  Source: iac · Confidence: high · Evidence: infra/template.yaml:28-39, docs/design.md:7-8, app/agent.py:25-33 — Account-level monthly budget alert and monthly bill review exist, but token usage is never read from responses, so spend is not decomposed into its terms.
- `kwys-q2` [Not covered] Do you track cost per successful task, and gate releases on it?
  Source: user · Confidence: high · Evidence: docs/design.md:4 — User said there is no evaluation set and cost per resolved ticket is not measured.
- `kwys-q3` [Partially] Is every dollar attributed to the team or workload that caused it?
  Source: iac · Confidence: medium · Evidence: infra/template.yaml:12-14, app/agent.py:14, app/agent.py:26 — Lambda carries team/app tags (user confirmed no chargeback beyond tags), but Bedrock is called by raw model ID with no application inference profile or requestMetadata.

### Model Inference · Route to the right model — Gap

- `rtm-q1` [Not covered] Does each request go to the cheapest model that meets your quality bar?
  Source: code · Confidence: high · Evidence: app/agent.py:14, app/nightly_summaries.py:15, docs/design.md:4 — Every request, including simple nightly ticket summaries, goes to one frontier Opus model with no routing.
- `rtm-q2` [Unknown] Do you audit pinned model IDs against the lifecycle pages?
  Source: none · Confidence: low · Evidence: app/agent.py:14, app/nightly_summaries.py:15 — Model ID is pinned in two places (one hard-coded duplicate); no lifecycle audit found in files and the user did not say whether one exists.

### Model Inference · Route to the right price — Gap

- `rtp-q1` [Not covered] Do you choose Standard or batch deliberately for each workload?
  Source: code · Confidence: high · Evidence: app/nightly_summaries.py:1-3, app/nightly_summaries.py:13-18 — The deadline-free nightly summary job makes one synchronous on-demand call per ticket; no batch job or service tier is used anywhere.
- `rtp-q2` [Fully covered] Do you call cross-region inference profiles rather than single-Region model IDs?
  Source: code · Confidence: medium · Evidence: app/agent.py:14, app/nightly_summaries.py:15 — Both call sites use the us. Geographic cross-region profile; a global. profile would be about 10% cheaper if data residency does not require US-only.

### Model Inference · Cache what repeats — Gap

- `cwr-q1` [Not covered] Is prompt caching on, with the stable content placed first?
  Source: code · Confidence: high · Evidence: app/agent.py:16-18, app/agent.py:25-31 — The ~6,000-token system prompt and 16 tool specs are resent identically every call, but no cachePoint is set.
- `cwr-q2` [Not covered] Have you verified caching works, and do you track the hit rate?
  Source: docs · Confidence: high · Evidence: docs/design.md:9, app/agent.py:32-34 — Caching is not enabled, cache token counts are never read, and Bedrock invocation logging is off.
- `cwr-q3` [Not covered] Does your cache TTL match how often your sessions call?
  Source: code · Confidence: high · Evidence: app/agent.py:25-31 — No cache and no TTL choice; web-chat users pausing between turns would suit a 1-hour TTL.

### Model Inference · Set reasoning effort per call — Gap

- `eff-q1` [Not covered] Do you set reasoning effort for each type of step, rather than taking the model default?
  Source: code · Confidence: medium · Evidence: app/agent.py:25-31, app/nightly_summaries.py:14-18 — Neither call sets reasoning effort or a thinking budget (no additionalModelRequestFields); both take the model default for every step type.
- `eff-q2` [Not covered] Do you compare output tokens per successful task before you change an effort level?
  Source: user · Confidence: high · Evidence: docs/design.md:4 — User said there is no evaluation set, so output tokens per successful task are not compared.

### Model Inference · Self-host or distill when volume justifies it — Out of scope


### Agent Harness · System prompt — Gap

- `sp-q1` [Not covered] Is your system prompt as lean as it can be?
  Source: code · Confidence: high · Evidence: app/agent.py:16-18, docs/design.md:6, docs/support-policy.md:3-4 — The whole ~6,000-token support policy is sent as the system prompt on every model call, including every tool round.
- `sp-q2` [Partially] Is your system prompt versioned and cache-stable?
  Source: code · Confidence: medium · Evidence: app/agent.py:17-18, app/agent.py:27 — The prompt is byte-stable with no per-call values, but it has no version, token count or per-version cost tracking beyond the file in source control.

### Agent Harness · Context — Gap

- `csl-q1` [Not covered] Do you measure and budget what each request’s context contains?
  Source: code · Confidence: high · Evidence: app/agent.py:22-31 — No token counting, context budget or truncation; full history, system prompt and all tool specs go into every request unmeasured.
- `crs-q3` [Not covered] Are tool and runtime outputs bounded before they enter the context?
  Source: code · Confidence: medium · Evidence: app/tools.py:21-23, app/agent.py:36-37 — Tool results are appended to the context verbatim with no size bound or output contract; run_tool is a stub, so real result sizes are unknown.

### Agent Harness · Retrieval — Out of scope


### Agent Harness · Memory — Gap

- `csl-q2` [Not covered] Have you chosen how history is kept, instead of append-only?
  Source: code · Confidence: high · Evidence: app/agent.py:21-23, app/agent.py:33, app/agent.py:37 — History is append-only and the full conversation, including tool rounds, is resent every turn.
- `csl-q3` [Not covered] Do you prune at natural boundaries, without breaking the cache every turn?
  Source: code · Confidence: high · Evidence: app/agent.py:22 — Nothing trims, summarises or compacts history at any boundary.

### Agent Harness · Tool design — Gap

- `crs-q1` [Not covered] Do you keep a costed inventory of tools, skills and MCP servers?
  Source: code · Confidence: medium · Evidence: app/tools.py:3-19 — There is a list of 16 tool names in code, but no inventory with owner, definition tokens or measured runtime cost.
- `crs-q2` [Not covered] Does each call see only the tools it needs?
  Source: code · Confidence: high · Evidence: app/tools.py:1, app/agent.py:29 — All 16 tool specs are sent on every call regardless of the question's intent.

### Agent Harness · Orchestration — Gap

- `bso-q1` [Not covered] Do loops have termination and retry limits, with rules where rules suffice?
  Source: code · Confidence: high · Evidence: app/agent.py:24, app/agent.py:34-36 — The tool loop is while True with only a completion exit; no iteration cap, session token budget or retry policy.
- `bso-q2` [N/A] Is multi-agent used only where it beats a single agent?
  Source: code · Confidence: high · Evidence: app/agent.py:21-37 — The app is a single agent with no multi-agent orchestration.
- `bso-q3` [Not covered] Do you measure the full cost of a workflow, including retries and coordination?
  Source: code · Confidence: high · Evidence: app/agent.py:25-33 — Per-call usage is never read, so the cost of a full answer across tool rounds is not measured.

### Agent Harness · Guardrails and limits — Gap

- `ceb-q1` [Not covered] Are concurrency, queue depth and fan-out bounded in dispatcher code?
  Source: iac · Confidence: medium · Evidence: infra/template.yaml:5-14, app/nightly_summaries.py:13-18 — The Lambda sets no reserved concurrency and the code has no concurrency or queue limits; the nightly job is a serial loop over an unbounded ticket list.
- `ceb-q2` [Not covered] Are request, token and connection limits enforced per caller at the gateway?
  Source: iac · Confidence: high · Evidence: infra/template.yaml:28, app/agent.py:21 — No gateway, usage plan or per-user limit; user_id is passed in but never used, and the only control is an account-level budget alert.

### Agent Harness · Observability — Gap

- `teui-q1` [Not covered] Can you trace every model and tool call to its caller and task?
  Source: code · Confidence: high · Evidence: app/agent.py:25-31, app/nightly_summaries.py:14-18, docs/design.md:9 — No requestMetadata, tracing or correlation IDs on calls, and Bedrock model invocation logging is not enabled.
- `teui-q2` [Not covered] Do you reconcile invocations against requested work to find orphans?
  Source: docs · Confidence: medium · Evidence: docs/design.md:9 — With invocation logging off and no task ledger there are no invocation records to reconcile against requested work.
- `teui-q3` [Partially] Do you alert on calls with no task, after completion, or over budget?
  Source: iac · Confidence: medium · Evidence: infra/template.yaml:28-39 — Only an account-level monthly budget alert at 80%; no alerts on unmatched, post-completion or over-limit calls and no anomaly monitor.

### End User · Precise specifications to avoid rework — Incomplete

- `psr-q1` [Unknown] Do users specify output, constraints and scope before the agent starts?
  Source: none · Confidence: low · Evidence: app/agent.py:21, docs/design.md:3 — The backend takes a single free-text question; the web chat front end is not in the workspace and the user did not describe its intake.

### End User · Guided prompting to reduce input ambiguity — Incomplete

- `guid-q1` [Unknown] Does your interface offer clickable options instead of a blank text box?
  Source: none · Confidence: low · Evidence: No UI code is in the workspace and the user did not say whether the web chat offers quick replies or suggested follow-ups.
- `guid-q2` [Unknown] Are those inputs low-variance, so clarifying round-trips are rare?
  Source: none · Confidence: low · Evidence: No UI code or user answer shows whether chat inputs are constrained to low-variance choices.

### End User · Show the user what their session costs — Gap

- `cost-q1` [Not covered] Does your interface show users what their session costs?
  Source: user · Confidence: high · Evidence: User said the web chat does not show users anything about cost or usage.
- `cost-q2` [Not covered] Is that cost shown during the session, while users can still act?
  Source: user · Confidence: high · Evidence: User said the web chat shows no cost or usage, so nothing is shown during the session.

## Next step

This self-service assessment shows where your gaps are, but it does not rank or prioritise them. If you are an AWS customer and want a prioritised plan, share your gap report with your AWS account team and ask for a specialist-led engagement.
