# `bun dw` — Dev Worktrees

Run isolated, parallel Autumn dev stacks per git worktree. Each agent gets its own Neon DB branch, Redis (Dragonfly), SQS (ElasticMQ), portless HTTPS aliases, and tmux-wrapped dev server — no port collisions, no cross-contamination.

## When to use it

| You are                                  | Run                       |
|------------------------------------------|---------------------------|
| In the canonical (main) worktree         | `bun dev`                 |
| In a parallel agent worktree (direct)    | `bun dw`                  |
| Spawned by Conductor/Superset            | already done — `bun dw identify` to find your stack |

## Prerequisites

Most auto-install on first run:

- **Neon CLI** — `neonctl` (logs in via OAuth on first use)
- **psql** — for DDL against new branches
- **Docker + Compose** — spins Dragonfly + ElasticMQ per worktree
- **Stripe CLI** — used by the dev server for webhooks
- **tmux** — headless dev wrapping for agent worktrees
- **portless** — `npm install -g @portless/cli` for HTTPS aliases
- **emulate** — `npm install -g @kelby/emulate` for Google OAuth locally

## Lifecycle

```
bun dw              # provision (if first run) → start dev
bun dw setup        # provision only (no dev server)
bun dw run          # start dev server only (must already be provisioned)
bun dw identify     # discover your URLs / ports / tmux session
bun dw attach       # jump into tmux to watch logs interactively
bun dw logs         # tail last 2000 lines without attaching
bun dw reset        # nuke DB branch + containers → re-provision
bun dw teardown     # full cleanup of this worktree
bun dw teardown --all   # full cleanup of every agent worktree
bun dw disable      # rename .env.local -> .env.local.disabled (fall back to canonical env)
bun dw enable       # rename .env.local.disabled -> .env.local
bun dw make-admin   # set the better-auth global role to 'admin' for every user in this worktree's DB
```

## Subcommands

### `bun dw` (no args)
Registers the current worktree, provisions a Neon branch (first-run only), ensures Docker compose services, writes `.env.local` files, kills stale ports, and starts the dev server.

```sh
bun dw
```

Worktree #1 runs inline; worktree #N>1 spawns in a detached tmux session when stdout is not a TTY.

### `bun dw setup`
Provisions the current worktree (Neon branch, Docker compose stack, env files) but **does not start the dev server**. Use when the orchestrator already owns the dev-server pane.

```sh
bun dw setup
```

### `bun dw run`
Starts the dev server in the **current** provisioned worktree. Fails if the worktree hasn't been registered yet. Always runs inline (never uses tmux) so the orchestrator's Run button owns the process.

```sh
bun dw run
```

### `bun dw identify`
Prints your stack's URLs and tmux session. Example output:

```
Worktree #3  (/Users/amianthus/Documents/Code/Autumn OSS/sirtenzin-autumn)
  Branch:        dw-wt-3-a1b2c3d
  Server URL:    https://wt3-api.localhost
  Vite URL:      https://wt3.localhost
  Tmux session:  dw-wt-3
  Server port:   8280
  Vite port:     3200

DW_WORKTREE_NUM=3
DW_SERVER_URL=https://wt3-api.localhost
DW_VITE_URL=https://wt3.localhost
DW_TMUX_SESSION=dw-wt-3
DW_SERVER_PORT=8280
DW_VITE_PORT=3200
```

Machine-parseable `KEY=value` pairs are emitted after the blank line for `eval`-ing in shells.

### `bun dw list`
Shows all registered worktrees with ports and age.

```sh
bun dw list
#  1 | (canonical)              | server :8080 vite :3000 | 0d | /Users/.../main
#  3 | dw-wt-3-a1b2c3d           | server :8280 vite :3200 | 2d | /Users/.../wt3
```

### `bun dw reset`
Tears down **only this worktree's** DB branch, Docker compose stack, and env files, then re-provisions from scratch. Use when your DB is corrupt or you need a clean slate.

```sh
bun dw reset
```

### `bun dw logs`
Dumps the last 2000 lines from your tmux pane without attaching.

```sh
bun dw logs
```

### `bun dw attach`
Attaches your terminal to the worktree's tmux session. Detach with `Ctrl+B` then `D`.

```sh
bun dw attach
```

### `bun dw disable`
Renames each managed `.env.local` to `.env.local.disabled` so tooling falls back to the canonical (infisical-injected) env. Useful when a test or script needs the canonical env without nuking your worktree provisioning.

```sh
bun dw disable
```

### `bun dw enable`
Inverse of `disable` — restores each `.env.local.disabled` to `.env.local`.

```sh
bun dw enable
```

### `bun dw make-admin`
Sets the better-auth **global** user role to `admin` for every row in the `user` table of this worktree's DB, granting the superuser scope locally (the `/admin` routes + impersonation). Org membership roles (`member` table) are left untouched.

```sh
bun dw make-admin
```

Targets `databaseUrl` from the registry entry for the current worktree, falling back to `DATABASE_URL`. **Refuses to run against production** via the shared `assertNotProductionDb` guard (connection strings containing `us-east-2`).

### `bun dw teardown`
Full cleanup of the current worktree: deletes Neon branch, unregisters portless aliases, kills tmux session, removes Docker compose stack, removes `.env.local` files, and deletes the registry entry. If no other agent worktrees remain, also stops emulate + portless daemons.

```sh
bun dw teardown
```

**Refuses to teardown worktree #1 (canonical).**

### `bun dw teardown --all`
Same as above, but for **every** registered agent worktree. Leaves worktree #1 untouched.

```sh
bun dw teardown --all
```

## URL & port allocation

| Worktree | Server URL | Vite URL | Tmux session | Server port | Vite port |
|----------|------------|----------|--------------|-------------|-----------|
| #1 (canonical) | `http://localhost:8080` | `http://localhost:3000` | *(none, inline)* | 8080 | 3000 |
| #N (N>1) | `https://wtN-api.localhost` | `https://wtN.localhost` | `dw-wt-N` | `8080 + (N-1)*100` | `3000 + (N-1)*100` |

Direct ports are useful for `curl` when you don't want HTTPS cert hassles.

## Common workflows

### "I'm a fresh agent — where is my stack?"
```sh
bun dw identify
```

### "I want to query my own server"
```sh
eval $(bun dw identify | grep '^DW_')
curl -k $DW_SERVER_URL/health
```

### "I broke my DB — start over"
```sh
bun dw reset
```

### "I'm done — clean up"
```sh
bun dw teardown
```

## Gotchas

- **Canonical worktree (#1) is special.** It runs `bun dev` inline, has no tmux session, and cannot be torn down or reset via `bun dw`.
- **Branch names** follow `dw-wt-N-<hash>` (e.g. `dw-wt-3-a1b2c3d`). They are created from the `dw-template` Neon branch.
- **Env files are managed.** `bun dw` writes `server/.env.local`, `vite/.env.local`, and `apps/checkout/.env.local` with the per-worktree `DATABASE_URL`. Don't commit them.
- **Registry lives at** `~/.autumn-worktrees.json`. It tracks worktree numbers, branch names, and last-used timestamps. Deleting it orphans Neon branches and Docker containers.
- **Portless HTTPS** requires the `portless` daemon. If aliases aren't resolving, check `portless proxy status`.
- **Emulate** (Google OAuth) is shared across all worktrees and starts automatically when needed.

## How Conductor / Superset use this

Both orchestrators read a `config.json` in their respective dotdir (`.conductor/config.json`, `.superset/config.json`) that declares:

```json
{
  "setup": ["bun dw setup"],
  "run": ["bun dw run"],
  "teardown": ["bun dw teardown"]
}
```

- **`setup`** runs once when the workspace is created. It provisions the Neon branch, Docker compose stack, and env files, then returns without blocking on the dev server.
- **`run`** is restartable via the orchestrator's **Run** button. It owns its own terminal pane and starts the dev server inline (no tmux daemon).
- **`teardown`** runs automatically when the workspace is deleted.

As an agent landing in that worktree, you don't need to provision anything — just run `bun dw identify` to learn your environment.
