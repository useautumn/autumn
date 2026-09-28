# twd — test worker daemon

Always-on control plane for the `bun tw` Modal swarm. One API serves the
dashboard, the `bun tw` thin client, and agents.

```
 dashboard ─┐        ┌──────────────── twd (Railway) ─────────────────┐
 bun tw ────┼──API──►│ http/     one Hono API (OAuth | API key)        │
 agents ────┘        │ internal/ jobs · keys · accounts · runs ·       │
 GitHub ──webhook───►│           results · auth · github · ingress     │──► Modal
 Stripe ──webhook───►│ ingress   /ingress/connect → owning worker      │──► Stripe
                     │ Postgres  the single source of truth            │
                     └─────────────────────────────────────────────────┘
```

## Invariants

- **One API.** Every dashboard action is an API route; the dashboard has no
  private backend. Contract: `src/api/contract.ts`.
- **Singletons via jobs.** Every side-effecting operation is a `jobs` row with a
  unique `singleton_key`. A second request for a live key attaches to the
  existing job. Leases + fencing tokens make crashed jobs resumable.

  | kind          | singleton_key          |
  |---------------|------------------------|
  | `warm`        | `warm:<sha>`           |
  | `swarm`       | `swarm:<runId>`        |
  | `nuke`        | `nuke:<accountId>` (one row per account in the set) |
  | `reinit_keys` | `reinit_keys`          |

- **John's fixes are untouched.** Everything inside the sandbox (image, boot,
  warmup, runner, parser, Stripe budget) is reused from `scripts/tw`. A swarm
  runs in a **child process** (`internal/runs/swarmProcess/`) because
  `scripts/tw` keeps module-level state (hub, TUI store, registry).
- **Keys come only from `TW_V3_KEYS`.** A key is identified by its platform
  account id (`keys.platform_account_id`), never by list position.
- **Account ledger:** `clean → reserved → in_use → nuking → clean`.
- **Auth:** Google OAuth restricted to verified `@useautumn.com`, or an API key
  (hashed, revocable, owned by the user who minted it). Every mutation records
  `created_by` (user id) and `via` (`session` | `api_key:<id>`).

## Flows

**Auto-warm** — GitHub `push` / `pull_request` on open PRs, `dev`, `main` →
`warm:<sha>` job → publishes `tw-warm:<sha12>` on Modal.

**Swarm** — `POST /runs` → gate check (keys not draining) → claim accounts
(`in_use`) → `swarm:<runId>` job → child process fans out on Modal, streams
events → per-file `test_results` rows → teardown enqueues `nuke:<acct>` jobs.

**Re-initialise keys** — `POST /keys/reinit` → gate `draining` → wait for live
swarms + nukes → delete every webhook endpoint on each `TW_V3_KEYS` key →
register one Connect webhook per usable key → `<TWD_PUBLIC_URL>/ingress/connect/sandbox`
→ re-probe → gate `open`. Idempotent; safe to rerun.

**Baseline + drift** — nightly/merge runs on `dev` set per-file p50/p90 +
pass-rate. A branch run flags: fails-on-branch-passes-on-dev, or
duration > 1.5× dev p90. Scheduling is longest-first by dev p90; unseen files
first.

## Layout

```
apps/twd/
├── DESIGN.md
├── src/
│   ├── main.ts                 boots http + job runner
│   ├── api/contract.ts         zod request/response schemas + route table
│   ├── db/schema/              drizzle tables, one file per domain
│   ├── lib/                    env, getDb, logger, TwdContext
│   ├── http/                   app factory, auth middleware, routes/<domain>.ts
│   ├── internal/<domain>/      repos/ actions/ types/
│   └── cli/                    `bun tw` thin client
└── web/                        Vite + React dashboard (API-only)
```

## Budget (north star: full suite < 20 min)

```
 warm      0 min   pre-built on push
 fan-out  ~2 min   ~1,325 files → ~1,325 sandboxes (Modal V2, 20+/s)
 run     ≤15 min   slowest file; longest-first scheduling
 teardown  0 min   async nuke jobs
```

## Agents: MCP + errors

`POST /mcp` is an MCP server (streamable HTTP) on the same app, same auth
(OAuth session or `Authorization: Bearer twd_…`). Every tool calls the same
actions the REST routes call — no MCP-only behaviour.

| tool             | does                                             |
|------------------|--------------------------------------------------|
| `get_capacity`   | free accounts, usable keys, gate, live runs      |
| `warm_branch`    | warm any pushed branch (no PR needed)            |
| `start_run`      | branch + groups/files/grep → runId               |
| `get_run`        | status, failures, drift                          |
| `wait_for_run`   | blocks up to N s, returns the same shape         |
| `reserve_accounts` / `release_reservation` | pin accounts           |
| `list_catalog`   | groups + files for selection                     |

Every error is `{ error: { code, message, next, escalate } }`: `next` tells an
agent what to do now; `escalate` is non-null when only a human can fix it
(e.g. "branch not pushed", "no usable Stripe keys — ask a twd admin").
