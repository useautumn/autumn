# Dev environment (Capy + Daytona sandbox)

This repo runs end-to-end on Capy sandboxes via a native fork of `bun dw`.
The three pieces:

| When | Script | What it does |
| --- | --- | --- |
| Per-fresh-VM `Initialize` | `scripts/setup/capy-init.sh` | downloads `dragonfly`, extracts `goaws` via `crane`, installs `neonctl` globally, runs `bun install --frozen-lockfile` |
| Every-VM `Startup` | `scripts/setup/capy-startup.sh` → `scripts/capy/provision.ts` | spawns `dragonfly` (`:6379`) and `goaws` (`:9324`) as nohup daemons, provisions a Neon branch named `capy-<shortHash(DAYTONA_SANDBOX_ID)>` off the shared `dw-template`, applies migrations + SQL functions on first run only, then writes `.env.local` files keyed to the per-sandbox Daytona preview URLs |
| Terminal `dev` | `bun dev` | starts the full stack (server `:8080`, vite `:3000`, checkout `:3001`, leaf `:3099`, trigger, optionally Stripe CLI) via `scripts/dev.ts` |

`scripts/preload-env.ts` is loaded before every `bun` entry point and auto-imports
`server/.env.local`, `vite/.env.local`, and `apps/checkout/.env.local` — `bun dev`
picks them up without further plumbing.

## Required Capy environment variable

| Name | Used by | Required |
| --- | --- | --- |
| `NEON_API_KEY` | `neonctl` inside `provision.ts` for branching | **yes** |

Add it on the Capy project settings page (https://console.neon.tech →
Account settings → API keys gives you a personal key with full access). The
Neon CLI reads it automatically per
https://neon.com/docs/reference/neon-cli#global-options. Without it, the
Startup phase fails fast.

Optional pass-through env vars used by `bun dev` if present:
`STRIPE_SANDBOX_SECRET_KEY`, `STRIPE_SANDBOX_WEBHOOK_SECRET`,
`STRIPE_SANDBOX_CLIENT_ID`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`,
`POSTHOG_API_KEY`, `SLACK_BOT_TOKEN`.

## Daytona preview URLs

The sandbox exposes browser-reachable URLs at
`https://{port}-{DAYTONA_SANDBOX_ID}.proxy.daytona.work` — Capy's UI tabs
for "Vite" and "Server" use this pattern. The auth gate at the proxy
edge accepts the user's Daytona session cookie, so the browser flow works
transparently.

Server-internal traffic stays on `http://localhost:{port}` (the proxy edge
won't honor server-to-self requests — they redirect to Auth0). `dev.ts`
defaults to localhost for inter-process calls; the Daytona URLs only land
in `BETTER_AUTH_URL`, `CLIENT_URL`, `VITE_BACKEND_URL`, and
`VITE_FRONTEND_URL`.

## Logging in locally

The `emulate` Google OAuth emulator is not started by default on Capy
sandboxes — the back-channel call from the server to the Daytona preview
URL would 307 to Auth0 (no Daytona session cookie on server-to-self). Use
the email + OTP login flow instead: enter any email at `/sign-in`, the OTP
prints in the dev terminal's server log.

## What the dw / capy split looks like

- `scripts/dw` — developer laptop, Docker + portless, multi-worktree
- `scripts/tw` — Vercel µVM test-worker image (native PG18 + Dragonfly + goaws)
- `scripts/capy` + `scripts/setup/capy-*.sh` — Capy sandbox; native binaries
  like `tw` but uses Neon branching like `dw`

All three share `scripts/dw/helpers/neon.ts` for the Neon project ID and
branch operations, and the `dw-template` branch is the common parent.

## Re-provisioning

If the Neon branch is corrupt or the state file got out of sync, blow
away `~/.autumn-capy/state.json` and the dragonfly/goaws state, then
re-run the `provision` command:

```bash
rm -f ~/.autumn-capy/state.json
rm -rf ~/.autumn-capy/dragonfly
pkill -f /home/.autumn-capy/bin/dragonfly
pkill -f /home/.autumn-capy/bin/goaws
bash scripts/setup/capy-startup.sh
```

The Neon branch itself is preserved; if you want a fully fresh DB,
`neonctl branches delete capy-<shortHash>` first.
