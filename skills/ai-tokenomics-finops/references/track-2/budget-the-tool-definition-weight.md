<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Tool design

- Track: Track 2 - Purpose-Built Agentic AI Application · Agent Harness
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#budget-the-tool-definition-weight
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: Lowers the fixed capability tax and prevents runtime output from becoming recurring context.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `crs-q1` Do you keep a costed inventory of tools, skills and MCP servers?

- Fully covered looks like: Keep a versioned inventory of every tool, skill and MCP operation with an owner, a use case, its definition tokens and its measured runtime cost. definition tokens × calls per task is a fixed tax on every task.
- Evidence: A costed inventory of tools, skills and MCP servers.
- Search: code, config, docs files for `toolSpec|TOOL_SPECS|tools\s*=|@tool\b`, `mcpServers|inventory`

## `crs-q2` Does each call see only the tools it needs?

- Fully covered looks like: Separate the full registry from what one request carries: load a small core set plus the capabilities the current intent needs, and keep the rest out of the context.
- Evidence: Each call sent only the tools it needs.
- Search: code files for `toolConfig|tool_?choice|toolChoice`, `tools\s*[=:]`, `(select|filter)\w*.*tools`

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}; docs = **/*.{md,mdx,rst,adoc,txt}

Citations for the reader (not needed to answer): `references/track-2/citations/budget-the-tool-definition-weight.md`
