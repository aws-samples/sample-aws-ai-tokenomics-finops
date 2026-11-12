<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Developer education

- Track: Track 1 - AI Coding Assistant · End User
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#developer-education
- What it saves: Enabler — this is what makes every other Track 1 lever actually work. It saves nothing directly on the bill, but it's the difference between a cap developers understand as a signal and one they just experience as an obstacle to route around. (Qualitative: you'll see the gap it closes in your per-developer attribution data.)

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `dedu-q1` Have you published an organisational AI coding agent guide, kept as a living document, that covers setup, the constraints in place and why they exist, session best practices, and how to request a higher limit?

- Fully covered looks like: Give every developer the same starting point instead of leaving them to figure it out over months on their own. The anchor is a single organisational guide — kept as a living document, not a one-time launch, since the tools it describes change every few months.
- Evidence: A living org guide for the coding agent: setup, constraints and why, session practice, how to raise a limit.
- Search: docs files for `(coding (agent|assistant)|ai) (guide|playbook|handbook)`, `best practices?`, `how to request`

## `dedu-q2` Does onboarding get the assistant installed and correctly configured on day one, with the organisation-level settings and skills, the team's own, and whatever the repository ships?

- Fully covered looks like: A developer's first week sets habits that stick — and if that week runs on default configuration, they're paying the expensive default the whole time. Make day-one setup an explicit step that installs all three configuration layers: organisation settings and skills, the team's own, and whatever the repository ships.
- Evidence: Onboarding that installs and configures the agent with org, team and repo settings on day one.
- Search: docs, agent-config files for `onboard`, `getting started|set ?up|install`
- Usually only the user knows: search, then ask.

## `dedu-q3` Do developers learn the habits through pair and mob programming on real work, using existing external courses for the fundamentals instead of building your own training from scratch?

- Fully covered looks like: Context management, effort matching, and good prompting are hard to teach as rules but obvious when you watch someone do them. Pair and mob programming on real tasks is how they spread — a developer sees a colleague reset context, plan before a multi-file change, or phrase a request that lands first time.
- Evidence: Pair or mob programming with the agent, and use of existing external courses.
- Search: docs files for `pair programming|mob programming|ensemble`, `course|training`
- Usually only the user knows: search, then ask.

## `dedu-q4` Do you sponsor internal AI champions and run a community of practice, so new practices and cost wins found by individuals spread across the organisation?

- Fully covered looks like: New models and features ship faster than any platform team can document them — the developers using the tools daily find the new tricks first. A written guideline captures what was true when someone wrote it down; a community of practice captures what's true right now.
- Evidence: Sponsored AI champions and a community of practice.
- Search: docs files for `champions?`, `community of practice|guild`
- Usually only the user knows: search, then ask.

Glob sets: docs = **/*.{md,mdx,rst,adoc,txt}; agent-config = **/.kiro/** **/.claude/** **/.codex/** **/.opencode/** **/.agents/** **/AGENTS.md **/CLAUDE.md **/.mcp.json **/mcp.json **/opencode.json

Citations for the reader (not needed to answer): `references/track-1/citations/developer-education.md`
