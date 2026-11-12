<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Memory

- Track: Track 2 - Purpose-Built Agentic AI Application · Agent Harness
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#design-memory-and-compaction-as-architecture
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Sub-linear history cost: the context sent per call stops growing with the age of the session, and compaction at boundaries keeps the cache discount intact.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `csl-q2` Have you chosen how history is kept, instead of append-only?

- Fully covered looks like: Decide how the agent remembers before the history grows: a fixed window, rolling summaries, or retrieval from external memory. Append-only history makes cost grow with the age of the session rather than the size of the task.
- Evidence: How conversation history is kept: append-only, windowed, summarised, or a memory store.
- Search: code files for `history`, `messages\s*(\+|=|\.append)`, `memory|summar|compact`

## `csl-q3` Do you prune at natural boundaries, without breaking the cache every turn?

- Fully covered looks like: Prune at natural boundaries (task completion, an idle gap longer than the cache TTL, a size threshold), not every turn, because each prune rewrites the cached prefix and pays the write premium again. Keep the conclusion, drop the raw material.
- Evidence: History pruned at natural boundaries without breaking the cache every turn.
- Search: code files for `trim|prune|truncat|summar|compact`, `messages\[-?\d`

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}

Citations for the reader (not needed to answer): `references/track-2/citations/design-memory-and-compaction-as-architecture.md`
