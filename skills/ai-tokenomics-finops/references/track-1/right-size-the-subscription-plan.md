<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Right-size the subscription plan

- Track: Track 1 - AI Coding Assistant · Model Inference
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#right-size-the-subscription-plan
- What it saves: The organisation stops paying for idle seats and for plan capacity its users do not draw on. The saving depends on the organisation's contract and seat mix, so do not quote a multiplier without a current price source.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `seat-q1` Do you audit who actually uses what, and remove or downgrade inactive seats?

- Fully covered looks like: Coding assistants carry a per-seat licence cost that token-billed agentic work does not. That makes two actions here rather than one: remove or downgrade the seats nobody is using, and match the tier for the people who are (the next question).
- Evidence: A seat-usage audit and removal of inactive seats; usually only the user knows.
- Search: docs files for `\bseats?\b`, `inactive (users?|seats?)`, `licen[cs]e (audit|review)`
- Usually only the user knows: search, then ask.

## `seat-q2` Have you matched each user’s Kiro plan tier to observed usage, or moved the team to a shared credit pool?

- Fully covered looks like: Match plan capacity to observed usage, then repeat the review before renewal. Kiro’s individual plans step up from Pro through Pro+ and Pro Max to Power, each with a larger monthly credit allowance, and paid plans can buy add-on credits (Kiro pricing [58]). Move a user to a higher tier only when their observed usage keeps exceeding the lower one.
- Evidence: Kiro plan tiers matched to usage, or a shared credit pool; usually only the user knows.
- Search: docs files for `kiro (pro|power|enterprise)`, `credit (pool|sharing)`, `plan tier`
- Usually only the user knows: search, then ask.

## Citations

- [196] Share Kiro credits across your team with credit pooling. Kiro Blog; accessed 9 November 2026. https://kiro.dev/blog/credit-pooling/
- [58] Pricing. Kiro. https://kiro.dev/pricing/
- [195] Share credits across your team with credit pooling. Kiro changelog; accessed 9 November 2026. https://kiro.dev/changelog/general/credit-pooling/

Glob sets: docs = **/*.{md,mdx,rst,adoc,txt}
