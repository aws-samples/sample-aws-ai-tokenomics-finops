<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Track 2 - Purpose-Built Agentic AI Application: lever index

17 levers, 39 questions, in runbook order. Load ONE lever file at a time, only for levers the triage kept. Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#track-2

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

Levers marked "scopable" may be reported Out of scope when the user confirms they do not apply.

## Questions by persona

`ai-pm-leader` (AI PM or leader) is the default and means every question in the table below.

- `governance` (Governance, platform or FinOps), 10: kwys-q1, kwys-q2, kwys-q3, rtm-q2, rtp-q2, dis-q1, ceb-q2, teui-q1, teui-q2, teui-q3. Do not open these lever files: `cache-what-repeats`, `set-reasoning-effort-per-call`, `system-prompt`, `context-budget`, `retrieval-cost`, `design-memory-and-compaction-as-architecture`, `budget-the-tool-definition-weight`, `bound-the-reasoning-loop`, `precise-specifications-to-avoid-rework`, `guided-prompting-to-reduce-input-ambiguity`, `show-the-user-what-their-session-costs`
- `developer` (Developer), 1: psr-q1. Do not open these lever files: `know-what-you-spend`, `route-to-the-right-model`, `route-to-the-right-price`, `cache-what-repeats`, `set-reasoning-effort-per-call`, `distill-when-volume-justifies-it`, `system-prompt`, `context-budget`, `retrieval-cost`, `design-memory-and-compaction-as-architecture`, `budget-the-tool-definition-weight`, `bound-the-reasoning-loop`, `enforce-per-user-ceilings-at-the-gateway`, `audit-your-orchestration-for-hidden-invocations`, `guided-prompting-to-reduce-input-ambiguity`, `show-the-user-what-their-session-costs`
- `builder` (App builder), 32: kwys-q2, rtm-q1, rtm-q2, rtp-q1, rtp-q2, cwr-q1, cwr-q2, cwr-q3, eff-q1, eff-q2, dis-q1, dis-q2, dis-q3, sp-q1, sp-q2, csl-q1, crs-q3, rag-q1, rag-q2, rag-q3, csl-q2, csl-q3, crs-q1, crs-q2, bso-q1, bso-q2, bso-q3, ceb-q1, guid-q1, guid-q2, cost-q1, cost-q2. Do not open these lever files: `audit-your-orchestration-for-hidden-invocations`, `precise-specifications-to-avoid-rework`

With any persona other than `ai-pm-leader`, answer only the questions in its list: skip the others, and skip a lever with none of them. A question's own personas are also in its lever file.

| Layer | Lever | Questions | File |
|---|---|---|---|
| Model Inference | Know what you spend and what it buys (scopable) | kwys-q1, kwys-q2, kwys-q3 | `references/track-2/know-what-you-spend.md` |
| Model Inference | Route to the right model (scopable) | rtm-q1, rtm-q2 | `references/track-2/route-to-the-right-model.md` |
| Model Inference | Route to the right price (scopable) | rtp-q1, rtp-q2 | `references/track-2/route-to-the-right-price.md` |
| Model Inference | Cache what repeats (scopable) | cwr-q1, cwr-q2, cwr-q3 | `references/track-2/cache-what-repeats.md` |
| Model Inference | Set reasoning effort per call (scopable) | eff-q1, eff-q2 | `references/track-2/set-reasoning-effort-per-call.md` |
| Model Inference | Self-host or distill when volume justifies it (scopable) | dis-q1, dis-q2, dis-q3 | `references/track-2/distill-when-volume-justifies-it.md` |
| Agent Harness | System prompt (scopable) | sp-q1, sp-q2 | `references/track-2/system-prompt.md` |
| Agent Harness | Context (scopable) | csl-q1, crs-q3 | `references/track-2/context-budget.md` |
| Agent Harness | Retrieval (scopable) | rag-q1, rag-q2, rag-q3 | `references/track-2/retrieval-cost.md` |
| Agent Harness | Memory (scopable) | csl-q2, csl-q3 | `references/track-2/design-memory-and-compaction-as-architecture.md` |
| Agent Harness | Tool design (scopable) | crs-q1, crs-q2 | `references/track-2/budget-the-tool-definition-weight.md` |
| Agent Harness | Orchestration (scopable) | bso-q1, bso-q2, bso-q3 | `references/track-2/bound-the-reasoning-loop.md` |
| Agent Harness | Guardrails and limits (scopable) | ceb-q1, ceb-q2 | `references/track-2/enforce-per-user-ceilings-at-the-gateway.md` |
| Agent Harness | Observability (scopable) | teui-q1, teui-q2, teui-q3 | `references/track-2/audit-your-orchestration-for-hidden-invocations.md` |
| End User | Precise specifications to avoid rework (scopable) | psr-q1 | `references/track-2/precise-specifications-to-avoid-rework.md` |
| End User | Guided prompting to reduce input ambiguity (scopable) | guid-q1, guid-q2 | `references/track-2/guided-prompting-to-reduce-input-ambiguity.md` |
| End User | Show the user what their session costs (scopable) | cost-q1, cost-q2 | `references/track-2/show-the-user-what-their-session-costs.md` |
