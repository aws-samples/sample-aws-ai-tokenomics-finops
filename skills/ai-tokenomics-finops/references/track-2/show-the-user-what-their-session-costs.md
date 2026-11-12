<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Show the user what their session costs

- Track: Track 2 - Purpose-Built Agentic AI Application · End User
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#show-the-user-what-their-session-costs
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Qualitative — recruits every user into the cost loop instead of leaving optimisation entirely to the platform team.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `cost-q1` Does your interface show users what their session costs?

- Fully covered looks like: Show a running figure in the interface, such as “this session has used about N tokens” or an approximate dollar amount. Users cannot economise on a quantity they never see.
- Evidence: The interface shows users what their session costs.
- Search: code files for `session.?cost|cost.?(meter|so far)|tokens? used|credits? (used|left|remaining)`, `\busage\b`

## `cost-q2` Is that cost shown during the session, while users can still act?

- Fully covered looks like: Show it live, during the session. An approximate number now changes behaviour; a precise number on next month’s invoice changes nothing.
- Evidence: That cost shown during the session, while the user can still act.
- Search: code files for `session.?cost|cost.?(meter|so far)|live|stream`
- Usually only the user knows: search, then ask.

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}

Citations for the reader (not needed to answer): `references/track-2/citations/show-the-user-what-their-session-costs.md`
