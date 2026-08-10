# Driving Devin and Conductor from a local agent session

How the Devin and Conductor cloud-agent platforms were set up and are operated
programmatically. No credentials here — everything is referred to by env var
name. Values live in `~/.zshrc` and Infisical.

## Why this exists

Both platforms run coding agents in cloud sandboxes against the Autumn repos.
Getting `bun dw` working in them surfaced a long tail of non-obvious behaviour
that is expensive to rediscover. This is the operational reference.

---

## Conductor

### API

Base `https://api.conductor.build/v0`, bearer auth via `CONDUCTOR_API_KEY`.
**There is a full OpenAPI spec at `/v0/openapi.json`** — read it rather than
guessing; it documents fields the published docs omit.

21 routes, all workspaces/sessions/messages/projects/sql. Notably **absent**:
anything for the machine image, install script, builds, or port forwarding.
Those are UI-only.

```
GET  /v0/projects                       list connectable repos
POST /v0/workspaces                     create workspace + first session
GET  /v0/workspaces/{id}/status         initializing | ready | archived
POST /v0/sessions/{id}/messages         prompt the agent   (field: "message")
GET  /v0/sessions/{id}/messages         transcript
GET  /v0/sessions/{id}/status           working | idle | error
POST /v0/workspaces/{id}/archive        tidy up
POST /v0/sql                            read-only SQL over session transcripts
```

### The fields that matter

`POST /v0/workspaces` accepts far more than the docs show:

| field | why it matters |
|---|---|
| `branch` | **test a branch without merging to dev** |
| `env` | arbitrary env vars per workspace, no UI |
| `agent` | claude / codex / cursor / acp |
| `model` | e.g. opus-5-1m, sonnet, gpt-5.x |
| `effort` | none … ultra |

`branch` plus `env` is what makes a full iterate-loop possible from here:
edit → push branch → create workspace on it → prompt → read transcript → repeat.

### Gotchas

- **Messages paginate at 100 regardless of `limit`.** Walk `offset` until
  `hasMore` is false, or you will read a stale window and think the agent never
  replied. This cost several wrong conclusions.
- **Transcripts contain raw ANSI control characters** that break `jq`. Pipe
  through `tr -d '\000-\037'` first.
- **Sort by `sessionIndex`** to find the newest message; array order is not
  reliable.
- **Workspaces auto-archive.** Every call then returns `400 Workspace is
  archived`. Not a bug in your code.
- **The agent ends its turn after "arming a poller".** Long waits must be a
  single inline `bash -c '...'` with the sleep loop inside, ending in a sentinel
  like `DONE`. Asking it to "check back in 5 minutes" silently does nothing.
- `jq` is **not installed** in the sandbox — don't rely on it in probe commands.

### SQL endpoint

One view, `session_transcripts_view`: `session_id`, `workspace_id`,
`transcript`, `session_title`, `agent_type`, `model`, `workspace_name`,
`workspace_state`, `repo_url`, timestamps. Useful for finding a workspace by
name, or auditing what agents actually did, without opening the app.

### Machine and repo config

- **Cloud computer** is org-wide and shared: one image, all workspaces. Built
  from an "Install software" script (UI-only). Amazon Linux 2023, `dnf`, sudo
  available. Ships Node/npm/pnpm/python/git/gh/ripgrep/tmux/vim — **no bun, no
  Docker, no Docker Compose plugin.**
- **Repo config** lives in `.conductor/settings.toml` (committed). Precedence,
  highest first: `settings.managed.toml` → **`settings.local.toml`** →
  `settings.toml` → user settings → defaults. Replacement is **per key**.
- `.conductor/settings.local.toml` is untracked and materialised per workspace.
  It has repeatedly shadowed `scripts.setup`, so the committed setup script
  never fires even though the Settings UI displays it. Symptom: workspace comes
  up with skills synced but no containers.

### Our layout

```
.conductor/settings.toml     setup / archive / run.dev
.conductor/setup.sh          once at creation: dockerd, compose plugin,
                             shell aliases, bun dw setup
.conductor/workspace.sh      Run button: ensure dockerd, fall back to
                             setup.sh if unprovisioned, bun dw run
.conductor/shellrc.sh        non-secret aliases + PATH, sourced into ~/.bashrc
```

The fallback in `workspace.sh` must call **`setup.sh`**, not `bun dw setup`
directly — otherwise it skips the compose-plugin install that sits above that
line, and the stack silently comes up with zero containers.

---

## Devin

### API

Two generations, and the distinction matters:

- **v1** (`/v1/...`) — sessions, secrets. Works with a legacy `apk_user_` key.
- **v3 / v3beta1** — blueprints, builds, repo indexing, playbooks, org secrets.
  **Requires a `cog_` service user key**; legacy keys 403 everywhere.

There is **no API to mint a service user** — it is the bootstrap credential and
must come from the dashboard once.

```
POST /v1/sessions                                          create session
GET  /v1/session/{id}                                      status + messages
POST /v1/secrets                                           org secret (type: key-value)
GET  /v3/self                                              whoami
GET/POST/PATCH /v3beta1/organizations/{org}/snapshot-setup/blueprints
POST /v3beta1/organizations/{org}/snapshot-setup/builds    trigger a build
PUT  /v3beta1/organizations/{org}/repositories/indexing    index repos
POST /v3/organizations/{org}/playbooks                     playbooks
```

Blueprint create **ignores `contents`** — POST to create, then PATCH the YAML in.
No GET ever returns `contents`, so the build log is the only verification.

Session control (terminate/archive) is not on v1; use the MCP tool
`devin_session_interact`.

### Blueprint gotchas — each cost a failed build

- **`$ENVRC` is a KEY=VALUE store.** It does *not* evaluate `$(...)`, and
  multi-line commands get split — a backslash-continued login ran with no flags
  at all. Bake a helper script and have the agent run it.
- **`maintenance` steps execute during the build**, despite docs saying they are
  only surfaced as context. Anything session-scoped must not live there.
- **npm's global prefix is not on PATH**; `npm i -g` silently yields binaries
  nothing can find. Set `npm config set prefix "$HOME/.local"`.
- **Sensitive secrets are withheld at build time** so they can't bake into the
  image — anything that needs them must run at session start.
- One snapshot serves the whole org; all configured repos are cloned into it.

### Skills

Devin has native Agent Skills, but they are **not** Claude Code skills:

- Discovered from **committed** repo content at `.agents/skills/`,
  `.devin/skills/`, `.github/skills/`, `.claude/skills/`.
- Indexed **across every connected repo**, org-wide — so they can live in a
  private repo and still resolve in sessions on a public one.
- Invoked as `@skills:name`. Not `!macro` — that is playbooks, a separate and
  largely redundant mechanism.
- ai-sync's symlinks into a gitignored dir are therefore invisible. `bun sync
  devin` writes real copies into the private `ai` repo instead. **Never into
  `useautumn/autumn`, which is public.**

---

## Shared patterns

### The iterate loop

Both platforms clone from GitHub, so nothing takes effect until pushed:

```
edit locally → push branch → create workspace/session on that branch
            → prompt with ONE self-contained bash command
            → read transcript → repeat
```

Conductor supports `branch` directly. For Devin the blueprint's `clone.ref`
decides.

### Prompting a cloud agent

- Ask for **exact output**, and say "do not fix anything" when diagnosing —
  otherwise it edits files mid-investigation.
- Put the whole probe in one `bash -c '...'` ending in `DONE`.
- Have it report **process ownership** (`ps aux`) when checking whether a server
  is up. A stale orphan answering on the port looks identical to success and
  produced one false "it works".
- Detach long-running processes with `setsid`, not a bare `&` — the agent's
  process group is torn down when its turn ends.

### Auth shapes

| | works headless | notes |
|---|---|---|
| Header / API key | yes | preferred everywhere |
| OAuth | no | callback is hardcoded to `localhost:PORT`; the request to make it configurable was closed as not planned |
| Device code | yes | only Executor advertises it among our servers |

Consequence: OAuth-only MCPs (axiom, linear) show `needs-auth` in cloud
sessions. Executor accepts an API key **and** OAuth, and fronts several
providers, so it is the practical door into them. ai-sync drops headers whose
env vars are unset, so one config serves both key-holders and OAuth users.

---

## Open items

- `settings.local.toml` shadowing `scripts.setup` — everything currently works
  via the fallback, which is a workaround, not the design.
- Reserved ngrok domains collide across concurrent workspaces (every workspace
  is worktree 1). Withholding `NGROK_API_KEY` while keeping `NGROK_AUTHTOKEN`
  gives random per-workspace domains instead.
- `eve` fails independently on an `EOVERRIDE` / `drizzle-orm@catalog` conflict —
  a repo dependency problem, not a platform one.
