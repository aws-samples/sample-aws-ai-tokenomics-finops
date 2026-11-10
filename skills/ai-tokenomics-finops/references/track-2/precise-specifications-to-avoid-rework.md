<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Precise specifications to avoid rework

- Track: Track 2 - Purpose-Built Agentic AI Application · End User
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#precise-specifications-to-avoid-rework
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Prevents avoidable correction rounds, reducing repeated exploration and generation caused by missing requirements.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `psr-q1` Do users specify output, constraints and scope before the agent starts?

- Fully covered looks like: Ask users to state five things before the agent starts: the required output, constraints, edge cases, one example, and what is out of scope. Every correction round re-sends the whole context, so a one-minute specification is cheaper than one retry.
- Evidence: An interface or template that asks for output, constraints and scope before the agent starts.
- Search: code, docs files for `output format|constraints|scope`, `template|required field|schema`
- Usually only the user knows: search, then ask.

## Citations

- [7] Cost optimization. AWS Prescriptive Guidance, Agentic AI on serverless. https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/cost-optimization.html

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; docs = **/*.{md,mdx,rst,adoc,txt}
