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

## Ports

| Port | Owner |
| --- | --- |
| 3000 | vite frontend (`Vite` preview tab) |
| 3001 | checkout app |
| 3099 | leaf / chat |
| **8090** | **Autumn server** (`Server` preview tab) — NOT 8080 |
| 6379 | Dragonfly |
| 9324 | goaws |

`SERVER_PORT=8090` instead of the usual 8080 because Capy's `kappu` visual
desktop streaming server (the one driving the desktop view) already owns
:8080. Binding `bun dev` there sends `kappu` FATAL and blacks out the
desktop. `provision.ts` emits `SERVER_PORT=8090` into `server/.env.local`
and all preview URLs use 8090 to match.

## Daytona preview URLs

The sandbox exposes browser-reachable URLs at
`https://{port}-{DAYTONA_SANDBOX_ID}.proxy.daytona.work` — Capy's UI tabs
for "Vite" (port 3000) and "Server" (port 8090) use this pattern. The
auth gate at the proxy edge accepts the user's Daytona session cookie, so
the browser flow works transparently when accessed via the Capy UI.

Server-internal traffic stays on `http://localhost:{port}` (the proxy edge
won't honor server-to-self requests — they redirect to Auth0). `dev.ts`
defaults to localhost for inter-process calls; the Daytona URLs only land
in `BETTER_AUTH_URL`, `CLIENT_URL`, `VITE_BACKEND_URL`,
`VITE_FRONTEND_URL`, and `VITE_API_URL`.

### Validating the auth flow from inside the sandbox

In-sandbox browsers (the one the `computer` tool drives) don't have a
Daytona session, so hitting the public preview URL from inside the
sandbox gets you a 307 to Auth0 — you can't exercise the full auth round
trip without temporarily swapping env vars to localhost.

To dry-run the email-OTP flow end-to-end from a sandbox-internal browser:

```bash
# Point both vite + checkout at localhost for an isolated test session.
sed -i 's|^VITE_BACKEND_URL=.*|VITE_BACKEND_URL=http://localhost:8090|' \
  vite/.env.local apps/checkout/.env.local
sed -i 's|^VITE_API_URL=.*|VITE_API_URL=http://localhost:8090|' \
  apps/checkout/.env.local
# Wipe vite caches so the new env values land in the bundle.
rm -rf vite/node_modules/.vite apps/checkout/node_modules/.vite
# Restart dev. The OTP will print in the dev log:
#   `RESEND NOT SET UP, SIGN IN OTP: NNNNNN`
bun dev
```

When done, re-run `bash scripts/setup/capy-startup.sh` to restore the
Daytona-URL config that real users see.

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
# Match by relative bin path so it works regardless of $HOME on this
# sandbox (root vs. a daytona user account both leave the binaries under
# `<home>/.autumn-capy/bin/...`).
pkill -f '/.autumn-capy/bin/dragonfly'
pkill -f '/.autumn-capy/bin/goaws'
bash scripts/setup/capy-startup.sh
```

The Neon branch itself is preserved; if you want a fully fresh DB,
`neonctl branches delete capy-<shortHash>` first.
