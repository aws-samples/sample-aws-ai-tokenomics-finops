# Skill smoke runner

`run.mjs` runs the [agent skill](../../skills/ai-tokenomics-finops/) end to end in one coding-agent client and
appends one result line to `smoke-log.jsonl`. It is not run in CI, because every run calls a paid client. Run it after
each skill change, once per client.

## Run

```sh
node tools/smoke/run.mjs --client claude   # Claude Code, `claude` on PATH
node tools/smoke/run.mjs --client codex    # OpenAI Codex CLI, `codex` on PATH
node tools/smoke/run.mjs --client kiro     # Kiro CLI, `kiro-cli` on PATH
```

Options: `--bin <path>` for a client binary that is not on PATH, `--log <file>` to write somewhere other than
`smoke-log.jsonl` (use it when you test the runner itself), `--timeout <minutes>` (default 45). The client must
already be signed in and configured for Amazon Bedrock. Node.js 22 or later, built-ins only.

Each run:

1. Copies `skills/ai-tokenomics-finops/examples/sample-bedrock-app/` into a fresh temporary folder (`git init`, no
   commit) and resolves its real path, because Codex rejects writes through a symlinked path.
2. Installs the skill the way the [skill README](../../skills/ai-tokenomics-finops/README.md#install) describes
   (`SKILL.md`, `references/`, `assets/`, `scripts/`, never `examples/`) into the client's project skills folder:
   `.claude/skills/`, `.agents/skills/` or `.kiro/skills/`.
3. Runs the client headless with one fixed prompt: use the skill on this repo, Track 2, persona `ai-pm-leader`, and
   the user answers from the [examples README](../../skills/ai-tokenomics-finops/examples/README.md). Permissions
   are as narrow as each client allows: Claude Code gets file tools and `Bash(node:*)`; Codex runs in its
   `workspace-write` sandbox; Kiro CLI trusts its read, write and shell tools.
4. Reads the client's JSON event stream and checks:

| Check | Passes when |
|---|---|
| `first_action` | The first tool call opens this skill's `SKILL.md`: a file read, `read.mjs` on it, or the client's own skill tool. A listing, search or any other command fails it. A to-do list update is not counted as an action. |
| `file_tools_only` | Every shell call is `node <skill>/scripts/prescan.mjs`, `report.mjs` or `read.mjs`, not chained, piped or redirected. `shell_calls` counts every shell call. |
| `report_valid` | `.ai-finops-assessment/report.md` exists and the findings pass the validator in `scripts/report.mjs`. |
| `report_identical` | The report file is byte for byte what `scripts/report.mjs` prints for the arguments the agent ran it with. |

`pass` is true only when all four pass. The temporary folder, with the client's transcript, is printed to stderr
and left in place so you can inspect it; `node tools/smoke/run.mjs --recheck <folder>` re-checks it and prints the
line without calling the client again or appending to the log.

## Log format

One JSON object per line: `date` (UTC ISO 8601), `client`, `client_version`, `skill_commit` (the checkout's commit,
with `+dirty` when the skill folder has uncommitted changes), `first_action` (short text such as
`read SKILL.md`), `shell_calls`, `checks` (the four booleans above), `pass`, `wall_seconds`, and `reason` when a run
did not pass. A client that is missing, fails to start, or makes no tool call is logged with
`first_action: "not started"`.

The log is public. It holds no costs, token counts, file paths, user or host names, account IDs or session IDs; keep
it that way if you extend the runner.
