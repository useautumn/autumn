# Agent Dev Setup

Two commands to spin up the full Autumn stack on a fresh Ubuntu VM — no Docker, no Infisical, no Supabase cloud signup, no interactive prompts.

## Commands

### `bun agent:bootstrap` — one-time

Installs all system dependencies and downloads required binaries. Safe to re-run; every step is guarded and completes in ~1s if already installed.

- Installs `postgresql-16` and `redis-server` via apt
- Installs `clickhouse-server` and `clickhouse-client` from the official ClickHouse apt repo
- Downloads the ElasticMQ jar to `/opt/elasticmq/elasticmq.jar` and writes its config
- Runs `bun install --frozen-lockfile` if `node_modules` is missing

### `bun dev:agent` — every session

Starts all local services, creates the database, writes env files, runs migrations, then starts the dev servers.

1. Starts `postgresql`, `redis-server`, and `clickhouse-server` via `service`
2. Starts ElasticMQ in the background on `:9324` (skipped if already running)
3. Creates the `autumn` Postgres database if it does not exist
4. Writes `server/.env` (skips if already present) and `vite/.env` from `vite/.env.example`
5. Runs `bun db:migrate`
6. Launches server `:8080`, vite `:3000`, checkout `:3001`, and workers via `scripts/dev.ts`

## Static team-wide env vars

Set these in the process environment before running `bun dev:agent` and they will be written into `server/.env` on first run:

| Variable | Description |
|---|---|
| `STRIPE_SANDBOX_SECRET_KEY` | Stripe test-mode secret key |
| `STRIPE_SANDBOX_WEBHOOK_SECRET` | Stripe test-mode webhook signing secret |
| `STRIPE_SANDBOX_CLIENT_ID` | Stripe Connect test platform client ID |
| `STRIPE_LIVE_SECRET_KEY` | Stripe live secret key |
| `STRIPE_LIVE_WEBHOOK_SECRET` | Stripe live webhook signing secret |
| `STRIPE_LIVE_CLIENT_ID` | Stripe Connect live platform client ID |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `RESEND_API_KEY` | Resend email API key |
| `RESEND_DOMAIN` | Resend sending domain |
| `SVIX_API_KEY` | Svix webhook API key |
| `POSTHOG_API_KEY` | PostHog project API key |
| `POSTHOG_HOST` | PostHog instance URL |

## Local services and ports

| Service | Port | Notes |
|---|---|---|
| PostgreSQL | 5432 | Database: `autumn`, user: `postgres`, password: `postgres` |
| Redis | 6379 | Used for `CACHE_URL` and `CACHE_URL_US_EAST` |
| ElasticMQ | 9324 | Local SQS replacement, queue: `autumn.fifo` |
| ClickHouse | 8123 | Used for `TINYBIRD_CLICKHOUSE_URL` |
| Server | 8080 | Autumn API server |
| Vite | 3000 | Frontend dev server |
| Checkout | 3001 | Checkout app dev server |

## SQS isolation

Each agent instance gets its own local ElasticMQ. `SQS_QUEUE_URL` is always hardcoded to `http://localhost:9324/000000000000/autumn.fifo` in `server/.env` — the shared `SQS_QUEUE_URL` from the Capy environment is intentionally ignored to prevent agents from consuming a shared queue.

## Known limitations

- **EventBridge lock-receipt scheduler**: `createSchedule` and `deleteSchedule` are no-ops when running against a local (non-amazonaws.com) queue URL. Lock-receipt expiry will not fire automatically in local dev.
- **Supabase logo upload**: Storage is not configured locally. Logo upload endpoints return 400 — expected.
- **Stripe webhooks**: `STRIPE_WEBHOOK_URL=http://localhost:8080`. Configure a Stripe CLI webhook forwarder separately if you need live webhook testing.

## Reset

To regenerate `server/.env` with fresh secrets:

```bash
rm server/.env vite/.env && bun dev:agent
```
