<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Guided prompting to reduce input ambiguity

- Track: Track 2 - Purpose-Built Agentic AI Application · End User
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#guided-prompting-to-reduce-input-ambiguity
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Cuts clarifying round-trips at the source, converting ambiguous, high-variance free-text turns into precise inputs and removing rework cycles before they start. It is the builder-owned complement to the user-owned Precise specifications lever, applied by the application rather than left to the user (qualitative; the magnitude tracks how much of your traffic is ambiguous free text today).

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `guid-q1` Does your interface offer clickable options instead of a blank text box?

- Fully covered looks like: Offer suggested follow-ups, quick replies or slot filling, so the user selects a precise next request instead of typing an ambiguous one.
- Evidence: Clickable options in the interface instead of only a blank text box.
- Search: code files for `<button|<select|radio|chip`, `suggest(ed|ion)s?|quick.?repl(y|ies)`

## `guid-q2` Are those inputs low-variance, so clarifying round-trips are rare?

- Fully covered looks like: Design each option so the agent can act on it in one pass. A predictable input removes the clarifying call and the redo.
- Evidence: Low-variance inputs (choices, validation) so clarifying round-trips are rare.
- Search: code files for `\benum\b|<select|dropdown|validat`, `clarif`
- Usually only the user knows: search, then ask.

## Citations

- [7] Cost optimization. AWS Prescriptive Guidance, Agentic AI on serverless. https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/cost-optimization.html

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}
