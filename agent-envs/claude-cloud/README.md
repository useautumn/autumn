# Claude cloud environment

Claude cloud (claude.ai/code, `claude --cloud`, desktop cloud sessions — all
share one environment config) has no repo-side environment file. The
environment object lives in the claude.ai UI; the repo contributes the
committed `.claude/settings.json` SessionStart hook, which runs
`scripts/setup/claude-cloud/session-start.sh` inside the cloud VM
(gated on `CLAUDE_CODE_REMOTE=true`, no-op locally).

## Boot flow

```
Setup script (this dir's setup.sh, snapshot-cached)
  → install tools + register executor-cloud with its Infisical headers helper
  → Claude Code launches with the attached repo and Executor tools
  → SessionStart hook: ai submodule → bun ai sync --copy
    → agent-bootstrap self-heal → bun install → secrets → Executor auth → orientation
```

The snapshot keeps files only, rebuilds when the setup script or the
allowed-domains list changes, and expires after ~7 days. The repo clone is
fresh per session, so the hook redoes repo-side work each session (fast once
the snapshot has warmed bun's global cache).

## Create the environment

claude.ai/code → cloud icon above the message box → Add cloud environment.

1. **Setup script**: paste `setup.sh` from this directory. Re-paste after
   editing it here — the UI copy is the live one.
2. **Environment variables** (`.env` format). Anyone who can use the
   environment can read these — keep the environment personal, don't
   org-share it with secrets inside:

   ```
   CLOUD_AGENT=1
   DW_HEADLESS=1
   BASH_ENV=/usr/local/share/autumn-env.sh
   INFISICAL_API_URL=https://app.infisical.com/api
   INFISICAL_CLIENT_ID=<universal-auth machine identity>
   INFISICAL_CLIENT_SECRET=<universal-auth machine identity>
   ```

   `EXECUTOR_API_KEY` stays in Infisical's dev environment. The setup script
   registers `executor-cloud` at user scope before Claude launches. Its
   `headersHelper` logs into Infisical and fetches the key when MCP connects.
   The session hook refreshes this registration from the repo configuration. The key is never written
   to MCP configuration or the environment snapshot. The machine identity
   needs read access to that secret. Other development credentials are
   pulled from Infisical by the session hook.
3. **Network access**: Custom, tick "include default list of common package
   managers" (covers npm, GitHub, `*.amazonaws.com` for the ElasticMQ jar),
   then add:

   ```
   bun.sh
   app.infisical.com
   executor.sh
   *.stripe.com
   apt.postgresql.org
   ppa.launchpadcontent.net
   www.postgresql.org
   packages.redis.io
   packages.clickhouse.com
   api.cloudflare.com
   *.argotunnel.com
   ```

4. **GitHub access** (verified blocker — without it, cloud sessions can't
   attach the repo at all and the hook's submodule clone fails with a
   credential error). Two documented paths:
   - **`/web-setup`** (simplest): run `claude` in a terminal, `/login` with
     the claude.ai account, then `/web-setup` — it stores the local `gh`
     token, and cloud sessions reach any repo that token reaches, including
     private useautumn/ai, with no App install. On Team/Enterprise the
     command is hidden until an Owner enables "Quick web setup" at
     https://claude.ai/admin-settings/claude-code.
   - **Browser**: https://claude.ai/code (in a real browser — the desktop
     app renders the onboarding deep link blank) → Sign in with GitHub;
     private repos then also need the Claude GitHub App installed on the
     org with both repos granted:
     https://github.com/apps/claude/installations/new

## What a session gets

- Skills, rules, AGENTS.md, `.mcp.json` via `bun ai sync --copy` (copies, not
  symlinks). The user-scope `executor-cloud` server gets its authentication
  header from Infisical without relying on project workspace trust; Axiom
  and PlanetScale MCPs stay unauthenticated — executor is the front door, and
  interactive MCP OAuth cannot complete in a cloud VM.
- Local infra installed but not running; the agent starts it with
  `bun scripts/dw/index.ts start` when needed. No port preview exists in
  Claude cloud — the dashboard is only reachable through the Cloudflare
  public URLs from `bun dw identify`.
- claude.ai connectors (Slack, Granola, …) arrive via the session host and
  bypass the domain allowlist; they're configured at
  claude.ai/customize/connectors, not here.

## Executor auth validation (local, 2026-09-11)

- Eight isolated tests (39 assertions) cover dev-secret retrieval, JSON
  escaping, failures, cloud-only registration, snapshot helper consistency,
  and keeping credentials out of MCP configuration.
- Claude Code 2.1.269 connected to a local mock MCP server through the real
  helper with simulated Infisical credentials. The server received the
  expected authentication header; no credential was saved in Claude config.
- Live cloud verification below separately checks the real identity and egress.

Run the focused tests outside the repository's integration-test preload:

```sh
repo_root="$PWD"
bun_bin="$(command -v bun)"
(cd /tmp && "$bun_bin" test "$repo_root/scripts/setup/claude-cloud/executorMcp.test.ts")
```

## Verified on a real cloud VM (probe run, 2026-09-11)

Run on the DEFAULT environment (no allowlist) via a one-off routine:

- `CLAUDE_CODE_REMOTE=true`, root, Ubuntu 24.04.4, x86_64, ~252GB disk.
- **`bun install --frozen-lockfile` works**: 39s cold, 6,583 packages, exit 0.
  `registry.npmjs.org` (plus jsr/pypi/crates) is proxy-exempt, which is why —
  the docs' bun-proxy warning does not bite for registry installs.
- **Preinstalled bun is stale (1.3.11) and silently skipped the
  `patches/@chat-adapter%2Fslack` patch entry.** `npm install -g bun@1.3.14`
  (6s) fixed it — hence the npm-pinned install in setup.sh and the hook.
- **Public unattached `git clone` of useautumn/autumn works** (2m42s), so
  setup.sh's warm-clone strategy is sound. `raw.githubusercontent.com` and
  `s3-eu-west-1.amazonaws.com` (ElasticMQ jar) are reachable.
- postgres 16 and redis 7 are preinstalled as services and start fine
  (`service postgresql start` → accepting connections; redis → PONG). Plain
  redis is NOT enough for Autumn (Lua needs RedisJSON → redis-stack), and
  clickhouse/stripe/cloudflared/infisical binaries are missing.
- **Default egress 403s everything else**: bun.sh, app.infisical.com,
  executor.sh, api.stripe.com, apt.postgresql.org, packages.redis.io,
  packages.clickhouse.com, api.cloudflare.com, and all third-party apt PPAs
  (`CONNECT tunnel failed, response 403`). Ubuntu's own mirrors work
  (`apt-get update` 12s, exit 0 with PPA warnings). This is exactly why the
  environment must use Custom network access with the list above.
- With GitHub connected (browser sign-in on this account), private
  useautumn/ai works BOTH ways: direct session attach and
  `git submodule update --init` inside the autumn clone — no credential
  errors, and `git push --dry-run` to autumn authenticates. Cloud clones
  autumn at its default branch (`dev`), so the hook files must land on dev.

## Verified in the custom Autumn environment (2026-09-11)

Two browser-launched cloud sessions verified the actual machine identity,
network policy, setup script, and MCP connection:

- Fresh environment verification:
  the saved setup script registered `executor-cloud` before Claude launched.
  Its tools were available in the first session, and native `list-artifacts`
  and `skills` calls returned real responses. The Claude process had
  `CLAUDE_CODE_REMOTE=true` and no `EXECUTOR_API_KEY` environment variable.
  Tool discovery exposed all seven Executor tools and 25 connected
  integrations; native `claude mcp list` also reported connected.
- Repository hook verification:
  exact source files were uploaded to a disposable checkout because they
  were not yet on `dev`. The final hook exited successfully in four seconds
  with no warnings. Stripe and Cloudflare credentials were fetched from
  Infisical and cached with mode 600. Native `claude mcp list` confirmed
  `executor-cloud` connected through the real headers helper.
- Private `ai` submodule cloning and sync generated 88 skills, four commands,
  and `.mcp.json`. Bun resolved to the repository pin, 1.3.14.
- The fresh session had Redis Stack, ClickHouse 26.8.2.7, PostgreSQL client
  16.13, Stripe CLI 1.33.0, Infisical 0.43.120, and cloudflared 2026.8.2.
  Environment preparation to Claude launch took about two minutes, with no
  setup failure or timeout markers. The Redis probe left no running service.
- The real headers helper completed in about 1.6 seconds per call, under
  Claude's ten-second limit. The Executor key was not serialized into MCP
  configuration or the snapshot.

The initial cloud probe found three issues now fixed: a stale Bun executable
shadowed the npm installation, Infisical secret reads needed an explicit
project ID, and project/local MCP helpers required persisted workspace trust.
The separate user-scope `executor-cloud` registration works without changing
workspace trust. Registration in the setup script makes tools available when
Claude starts; registration only in a running session was too late.

## Remaining setup and validation

- Automatic startup requires these hook files on the default branch, `dev`.
  The hook probe used uploaded source; automatic startup from the published
  default branch has not yet been separately exercised.
- The application development stack and its public dashboard have not been
  started by these probes.
- Skill files were generated; activation of every skill was not individually
  exercised.
