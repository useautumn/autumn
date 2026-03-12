---
name: openlogs-server-logs
description: Fetch and inspect recent local server logs in repos that use openlogs or the `ol` CLI. Use when a user asks what happened in the server, wants recent dev-server output, needs startup errors or stack traces, or asks you to check backend logs from `openlogs tail`, command-specific logs, or `.openlogs/latest.txt`.
---

# Openlogs Server Logs

Use `openlogs tail` to retrieve recent server logs before asking the user to paste anything. Prefer the cleaned text log unless ANSI or raw terminal bytes matter.

## Quick Start

- Run `openlogs tail -n 200` to inspect the latest run in the project.
- If the user mentions a specific command or service, run `openlogs tail <query> -n 200` to get the most recent matching run.
- Use `ol tail -n 200` if the short alias is preferred.
- Read `.openlogs/latest.txt` directly only when file access is simpler than spawning the command and you specifically want the latest overall run.
- Use `openlogs tail --raw -n 200` only when color codes, cursor control, or exact terminal output matters.
- Use `openlogs tail -f` for live follow mode.

## Workflow

1. Try `openlogs tail -n 200`.
2. If the user names a command or service, try `openlogs tail <query> -n 200`.
3. If that fails, try `ol tail -n 200`.
4. If the CLI is unavailable but the workspace is accessible, read `.openlogs/latest.txt` or the matching command-specific file in `.openlogs/`.
5. If the log directory is missing, check whether the server was started with `openlogs <command>` or `ol <command>`.
6. If it was not, tell the user to relaunch the server through openlogs, then inspect the resulting logs.

## Common Commands

```bash
openlogs tail -n 100
openlogs tail dev -n 100
openlogs tail server -f
openlogs tail -f
openlogs tail --raw -n 100
openlogs tail --out-dir logs -n 200
openlogs bun dev
ol npm run dev
```

## Interpretation Rules

- Prefer the text log for analysis because it strips ANSI noise.
- `openlogs tail` without a query means the latest run overall in the current project.
- `openlogs tail <query>` means the latest run whose command or explicit name contains that query.
- Switch to `--raw` only when the cleaned log hides something important.
- Quote the exact failing lines or error block in your answer when useful.
- State whether you are looking at the latest captured run or a live-following stream.
- If the agent cannot access local gitignored files, ask the user to run `openlogs tail -n 200` and paste the output.

## Response Shape

- Start with the command or file you used.
- Summarize the likely issue in 1 to 3 sentences.
- Include the most relevant error lines.
- If logs are missing, say exactly what command the user should rerun under openlogs.
