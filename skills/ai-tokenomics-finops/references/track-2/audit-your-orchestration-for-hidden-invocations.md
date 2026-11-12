<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Observability

- Track: Track 2 - Purpose-Built Agentic AI Application · Agent Harness
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#audit-your-orchestration-for-hidden-invocations
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Eliminates work no valid task required, exposing orphaned loops, retry storms and forgotten background callers before they become persistent traffic.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `teui-q1` Can you trace every model and tool call to its caller and task?

- Fully covered looks like: Stamp caller, task, workflow and harness version on every model and tool call when work enters the harness, and turn on Bedrock model invocation logging, which is off by default.
- Evidence: Every model and tool call traceable to its caller and task: request metadata, tracing, invocation logging.
- Search: code, iac files for `requestMetadata|correlation|request_?id|task_?id`, `x-?ray|opentelemetry|\botel\b|trace`, `invocation logging|loggingConfig|ModelInvocationLogging`

## `teui-q2` Do you reconcile invocations against requested work to find orphans?

- Fully covered looks like: Join invocation records to the task ledger. Any call with no valid task, after a terminal outcome, or above the configured calls per task is a finding, not usage.
- Evidence: Invocations reconciled against requested work to find orphans.
- Search: docs, code files for `reconcil|orphan`, `invocation log`
- Usually only the user knows: search, then ask.

## `teui-q3` Do you alert on calls with no task, after completion, or over budget?

- Fully covered looks like: Publish the reconciliation as metrics and alert on contract violations (unmatched calls, post-completion calls, calls per task over the limit), routed to the owner of that workflow and harness version.
- Evidence: Alerts on calls with no task, after completion, or over budget.
- Search: iac, code files for `alarm|anomaly`, `AWS::CE::Anomaly|aws_ce_anomaly`, `budget`

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; docs = **/*.{md,mdx,rst,adoc,txt}

Citations for the reader (not needed to answer): `references/track-2/citations/audit-your-orchestration-for-hidden-invocations.md`
