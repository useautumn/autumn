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
- **Stripe CLI** — used by the dev server for webhooks in the canonical worktree only
- **tmux** — headless dev wrapping for agent worktrees
- **portless** — `npm install -g @portless/cli` for HTTPS aliases
- **sparq** (optional) — `npm install -g trysparq` for **public** HTTPS tunnels via Cloudflare. If installed, `bun dw setup` auto-creates `wtN-$USER-<domain>` aliases alongside the portless aliases. Missing or unauthed sparq is non-fatal — local portless URLs still work.

Google OAuth is delegated to a Vercel-hosted `@emulators/google` instance (default `EMULATE_GOOGLE_URL` in `scripts/dw/constants.ts`). Override per-shell with `EMULATE_GOOGLE_URL=...` if you ever need to point at a different emulator. The legacy local emulate daemon (`scripts/setup/start-emulate.sh` + `helpers/emulate.ts`) is retained for manual fallback but no longer auto-started.

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
  Sparq API URL: https://wt3-amianthus-api.atmn.lol
  Sparq Vite URL: https://wt3-amianthus-web.atmn.lol
  Tmux session:  dw-wt-3
  Server port:   8280
  Vite port:     3200

DW_WORKTREE_NUM=3
DW_SERVER_URL=https://wt3-api.localhost
DW_VITE_URL=https://wt3.localhost
DW_TMUX_SESSION=dw-wt-3
DW_SERVER_PORT=8280
DW_VITE_PORT=3200
DW_SPARQ_API_URL=https://wt3-amianthus-api.atmn.lol
DW_SPARQ_VITE_URL=https://wt3-amianthus-web.atmn.lol
```

`Sparq *` lines and `DW_SPARQ_*` env vars only appear when a sparq tunnel exists for the worktree (i.e. `bun dw setup` succeeded in creating one). Machine-parseable `KEY=value` pairs are emitted after the blank line for `eval`-ing in shells.

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

| Worktree | Server URL | Vite URL | Sparq URLs (if installed) | Tmux session | Server port | Vite port |
|----------|------------|----------|---------------------------|--------------|-------------|-----------|
| #1 (canonical) | `http://localhost:8080` | `http://localhost:3000` | *(none)* | *(none, inline)* | 8080 | 3000 |
| #N (N>1) | `https://wtN-api.localhost` | `https://wtN.localhost` | `https://wtN-$USER-api.atmn.lol`, `https://wtN-$USER-web.atmn.lol` | `dw-wt-N` | `8080 + (N-1)*100` | `3000 + (N-1)*100` |

Direct ports are useful for `curl` when you don't want HTTPS cert hassles. Sparq URLs are public Cloudflare-tunneled and useful for webhooks / OAuth callbacks / sharing previews.

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
- **Env files are managed.** `bun dw` writes `server/.env.local`, `vite/.env.local`, and `apps/checkout/.env.local` with the per-worktree `DATABASE_URL` and `STRIPE_WEBHOOK_URL`. Don't commit them.
- **Stripe Connect webhook** is registered against the platform sandbox account during `bun dw setup`. The signing secret is persisted in `org.stripe_config.test_connect_webhook_secret` and reused on resume. Only worktree #1 uses the Stripe CLI webhook forwarder.
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
