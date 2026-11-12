<!-- GENERATED from content/ by scripts/build-skill.mjs. Do not edit; run `npm run build:skill`. -->

# Cache what repeats

- Track: Track 2 - Purpose-Built Agentic AI Application · Model Inference
- Runbook: https://aws-samples.github.io/sample-aws-ai-tokenomics-finops/#cache-what-repeats
- Can be scoped out: yes, if the user confirms it does not apply
- What it saves: About 90% to 95% off repeated-prefix input (cache reads at 0.1x or 0.05x base, by model), the single largest per-call saving for agentic workloads that re-send system prompts and tool definitions on every turn.

Answer each question with: `yes` (Fully covered), `wip` (Partially), `no` (Not covered), `na` (N/A), or `unknown` when neither the files nor the user answer it.

## `cwr-q1` Is prompt caching on, with the stable content placed first?

- Fully covered looks like: Turn caching on and order the request so the stable content comes first: system prompt, then tool schemas, then reference documents, then the variable user turn. A read bills at 0.1× or 0.05× the input price, depending on the model, and a 5-minute write at 1.25×, so one re-read already pays for the write.
- Evidence: Prompt caching enabled (cache points) with the stable system prompt and tools first.
- Search: code files for `cachePoint|cache_control|cacheConfig|prompt_?caching`, `system\s*[=:]`

## `cwr-q2` Have you verified caching works, and do you track the hit rate?

- Fully covered looks like: Check that cacheReadInputTokens is non-zero from the second call of a session, then chart cache hit rate = cache reads / (cache reads + cache writes + uncached input) weekly per inference profile and alert when it drops.
- Evidence: Cache hits verified and tracked: cache read and write token counts, invocation logging.
- Search: code, iac, docs files for `cache_?read_?input_?tokens|cacheReadInputTokens|cacheWriteInputTokens|CacheRead`, `hit rate`, `invocation logging|loggingConfig|ModelInvocationLogging`

## `cwr-q3` Does your cache TTL match how often your sessions call?

- Fully covered looks like: Use the 1-hour TTL (2× write) when users can pause for more than five minutes between calls, and the 5-minute default (1.25× write) for automated sessions that finish in seconds. A hit refreshes the TTL at no charge.
- Evidence: A cache TTL chosen to match how often sessions call.
- Search: code, config files for `\bttl\b`, `\b(5m|1h)\b`

Glob sets: code = **/*.{py,js,mjs,cjs,ts,tsx,jsx,java,kt,go,rs,cs,rb,php,scala,swift,vue,svelte,html}; iac = **/*.tf **/*.tf.json **/cdk.json **/{template,cloudformation,serverless,samconfig}*.{yaml,yml,json,toml} **/{infra,infrastructure,iac,cdk,terraform,stacks}/**; docs = **/*.{md,mdx,rst,adoc,txt}; config = **/*.{json,jsonc,yaml,yml,toml,ini,cfg,conf,properties}

Citations for the reader (not needed to answer): `references/track-2/citations/cache-what-repeats.md`
