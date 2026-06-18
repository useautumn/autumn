# `bun tw` — Cloud Test Swarm

A design + implementation plan for running Autumn's integration test suite across a
swarm of short-lived, isolated cloud sandboxes instead of serially on one machine.

> Status: **design draft**. Nothing here is built yet. This document is the source of
> truth for the architecture; iterate on it before writing code.

---

## 1. Problem & goal

Today `bun t` runs tests **locally**, serially-ish. The hard limit is **Stripe**:
there is one shared platform sandbox account + one shared `TESTS_ORG`, so test files
can only run ~2–4 in parallel (`testRunConfig.defaultConcurrency = 2`,
`TEST_FILE_CONCURRENCY` ≈ 3–4 in the legacy `g*.sh` scripts) before Stripe rate limits
and test-clock collisions cause flakes. With ~1,264 `*.test.ts` files (core ≈ 200), a
full run is slow.

**Goal:** a new command `bun tw` that keeps the nice local TUI/runner but fans the
actual execution out to a **pool of cloud sandboxes**, each fully isolated (its own DB,
its own Stripe Connect sub-account → its own rate-limit bucket). Commit a feature, run
`bun tw`, and have the whole suite tested in minutes against fresh, isolated Stripes.

Non-goals: replacing `bun t` (it stays for fast local single-file iteration); changing
what the tests assert.

---

## 2. Key facts that make this work (verified)

### Stripe isolation — the core enabler
- Topology: **1 Autumn Connect platform account → N unit-test orgs → N Stripe Connect
  sub-accounts.** Each sub-account (`acct_*`) has its **own** Stripe rate-limit bucket.
  So fanning out to N sub-accounts genuinely escapes the shared-account rate limit —
  this is the whole premise and it holds.
- `createConnectAccount` (`server/src/internal/orgs/orgUtils/createConnectAccount.ts`)
  already mints a sub-account via `stripe.v2.core.accounts.create(...)` using the
  platform key `STRIPE_SANDBOX_SECRET_KEY`.
- `createStripeCli({ org, env })` for a Connect org returns a **sub-account-scoped**
  client — it falls through to `initMasterStripe({ accountId })` =
  `new Stripe(STRIPE_SANDBOX_SECRET_KEY, { stripeAccount: acct_X })`
  (`initStripeCli.ts:53-54`). This is what the webhook handler uses for follow-up calls.

### Webhooks — the novel part
- Inbound Stripe webhooks today reach local dev via `stripe listen --forward-connect-to`
  with `STRIPE_WEBHOOK_SKIP_VERIFY=true`. That CLI uses the platform key and would
  fan **every** sub-account's events to **every** listener — unusable for a swarm.
- Instead, each worker registers a webhook endpoint **on its own sub-account** (scoped
  client, **not** `connect: true`), pointed at the **legacy** route
  `/webhooks/stripe/:orgId/:env` (`stripeWebhookRouter.ts:17`). Because the endpoint
  lives on the sub-account, Stripe only delivers that sub-account's events there →
  isolation is automatic, even though every worker's org id is the same hardcoded
  `org_2sWv2S8...`.
- The legacy seeder (`stripeLegacySeederMiddleware.ts`) resolves the org by the URL
  path param, honors `STRIPE_WEBHOOK_SKIP_VERIFY` (so **no signing secret needed**),
  and builds follow-up calls with `createStripeCli({ org, env })` → correct sub-account
  client. **Composes with zero changes.**
- Public reachability: Vercel Sandbox exposes a per-port public HTTPS URL via
  `sandbox.domain(port)`; it's reachable by unauthenticated external POST (Stripe) and
  known immediately after create (port must be declared in `ports` at create time).

### Provider — Vercel Sandbox
Chosen after comparing Daytona, Freestyle, Modal, Northflank, E2B, exe.dev, etc.
- Firecracker microVM, **full root + `sudo`**, can run system-privileged processes and
  multiple long-running services on the host (no Docker needed).
- **Snapshots** (filesystem, incl. installed packages) + `Sandbox.fork({ sourceSandbox })`
  → the "warm one, fork N" model.
- Per-port **public URL** for inbound webhooks; **outbound open by default** (`allow-all`
  firewall) so Stripe/Svix/GitHub are reachable with no config.
- **Usage-based billing, active-CPU only** (I/O wait is free) — ideal for Stripe-bound
  tests that spend most wall-clock waiting. **2,000 concurrent** ceiling on Pro
  (effectively uncapped for us) — not the tier-pool throttle Daytona has.
- Constraints: region `iad1` only; max 8 vCPU / 16 GB on Pro; default timeout 5 min;
  vCPU allocation rate 200/min (fleet ramps over ~1–2 min); `fork()` does **not** copy
  `env`.

---

## 3. Architecture overview

```
            ┌───────────────────────────── local machine (bun tw) ─────────────────────────────┐
            │  Dispatcher (Ink TUI, reuses runTestsV2 result model)                              │
            │   • builds the file work-queue from _groups / args                                 │
            │   • sliding window over a POOL of N workers (N is the knob, e.g. 200)               │
            │   • assigns next file(s) to any idle worker; collects + renders streamed results   │
            │   • retries failed files; reschedules dead workers                                 │
            └───────────────┬───────────────────────────────────────────────────────────────────┘
                            │  @vercel/sandbox SDK (OIDC token)
        ┌───────────────────┼───────────────────────────────────────────────┐
        ▼                   ▼                                                 ▼
   ┌─────────┐         ┌─────────┐                                      ┌─────────┐
   │worker 1 │         │worker 2 │     …  N workers, each a full          │worker N │
   │ µVM     │         │ µVM     │        self-contained Autumn stack:    │ µVM     │
   │ PG18    │         │ PG18    │        PG18 + Redis + Dragonfly +      │ …       │
   │ Redis   │         │ …       │        elasticmq-native + server      │         │
   │ Dragonfly         │         │        + its OWN Stripe sub-account    │         │
   │ elasticmq-native  │         │        + its OWN public webhook URL    │         │
   │ autumn server     │         │                                       │         │
   └────┬────┘         └─────────┘                                      └─────────┘
        │ public URL (sandbox.domain(PORT))
        ▼
   Stripe (sub-account acct_X) ── webhook ──▶ worker's /webhooks/stripe/<orgId>/sandbox
```

**Pool + sliding window (not one-sandbox-per-file).** We provision a fixed pool of `N`
workers. The dispatcher holds a queue of all selected test files and feeds each idle
worker the next file (or a small batch). A worker processes many files over its lifetime;
the window is "at most N files executing at once." This bounds provisioning cost to
**exactly N** sub-accounts/sandboxes regardless of file count, gives natural load
balancing across slow/fast files, and maps cleanly onto the existing `pLimit` runner
(replace "spawn local `bun test`" with "assign to a remote worker").

- **`N` (worker count)** is the primary knob: `bun tw --workers=200` (default
  configurable; sensible default e.g. 50). 1,264 files / 200 workers ≈ ~6 files per
  worker, run sequentially (or with small per-worker concurrency `K`).
- **`K` (per-worker file concurrency)** optional secondary knob: because each worker has
  its own rate-limit-isolated sub-account, it can safely run more than the local 2–4. A
  worker = "a private local test env," so `K` is bounded by the µVM's vCPU/RAM, not Stripe.

---

## 4. Snapshot model: base → warm → workers

Three tiers. The split exists so migrations are **never stale** relative to the git ref,
and a bad migration **fails once, before the swarm spawns**.

### 4a. Base snapshot (long-lived; rebuilt on lockfile change + nightly)
Ref-agnostic, slow-moving, expensive-to-build layers:
- Amazon Linux 2023 + `dnf` packages.
- **Native binaries** (no Docker): PostgreSQL 18 + `postgresql-contrib`, Redis,
  Dragonfly, `elasticmq-native` (GraalVM-compiled ElasticMQ — same engine/semantics as
  today, no JVM), a JRE only if some service still needs it (elasticmq-native does not).
- `bun` + a warmed `node_modules` keyed to `bun.lock`.
- An **initialized, empty app DB**: `initdb` cluster, `public` schema,
  `CREATE EXTENSION pg_trgm` — **no application tables**. This mirrors exactly what the
  Neon template branch does today (`scripts/dw/helpers/neon.ts:173`:
  `DROP SCHEMA … ; CREATE SCHEMA public; CREATE EXTENSION IF NOT EXISTS pg_trgm;`).
  `pg_trgm` is the **only** extension in the codebase (the migration
  `shared/drizzle/0000_bumpy_tinkerer.sql:835-880` creates `gin_trgm_ops` indexes that
  require it to pre-exist).

Trigger base rebuild on: `bun.lock` change (CI hook) + nightly cron. This bounds drift so
the warm-up delta below stays tiny.

### 4b. Warm snapshot (rebuilt every `bun tw`, on the ref under test)
`Sandbox.fork({ sourceSandbox: base })`, then:
1. `git fetch && git checkout <ref>` (the committed ref being tested).
2. `bun install --frozen` (delta only; near-instant when lockfile unchanged).
3. `bun db migrate` — applies tables + trgm indexes **once**. **If this fails, abort
   `bun tw` and surface the migration error. No workers are forked.** ← the
   "don't get wrecked ×1000" property.
4. Seed shared, identical-across-workers state: org row, features, products, API key —
   i.e. run the existing `createTestOrg` / `setupOrg` path **with
   `createStripeAccount: false`** (and Svix skipped — see §7). This is what makes every
   worker start from the same baked DB.
5. **Clean-stop** the stateful services so their on-disk state is consistent:
   `pg_ctl stop -m fast`, `redis-cli SAVE` / Dragonfly `SAVE`, flush elasticmq. (Vercel
   snapshots are **filesystem-only — process memory is NOT preserved** — so services
   must be cold-startable from disk; this is mandatory, not optional.)
6. `sandbox.snapshot()` → `warmSnapshotId` (the parent shuts down on snapshot).

### 4c. Worker forks (×N, ephemeral)
`Sandbox.fork({ sourceSandbox: warm, persistent: false, ports: [SERVER_PORT], timeout, env })`
(or `Sandbox.create({ source: { snapshot: { snapshotId: warmSnapshotId } }, … })`).
- `persistent: false` so workers **don't** auto-snapshot on stop (avoids N accumulated
  snapshots).
- Each worker's boot script: start services (they come up against the baked, migrated
  data dir → schema already present, **no re-migration**) → attach Stripe (§6) → optional
  Svix (§7) → signal "ready" to the dispatcher → start pulling files.

Because forks are copy-on-write from the warm snapshot, every worker gets an **identical
starting DB** then diverges independently. No cross-worker contamination.

---

## 5. Services on the µVM (native, no Docker)

All run on `localhost` inside the µVM; only the Autumn **server port** is exposed.

| Service          | How                                    | Notes |
|------------------|----------------------------------------|-------|
| PostgreSQL 18    | native binary + `postgresql-contrib`   | baked data dir (migrated in warm); `pg_trgm` from base |
| Redis            | native binary                          | primary cache |
| Dragonfly        | native binary                          | cache v2 (`CACHE_V2_DRAGONFLY_URL`) — separate from Redis |
| SQS              | **`elasticmq-native`** (Go-free, no JVM)| `SQS_QUEUE_URL_V2`, `TRACK_SQS_QUEUE_URL`; same semantics as current ElasticMQ |
| Autumn server    | `bun` (the app)                        | listens on `SERVER_PORT`; the **only** exposed port |

Culled vs `dw`: Portless, the Google OAuth emulator (Emulate), the Vite frontend, ngrok —
none needed for headless API + webhook tests. This shrinks the footprint and raises the
concurrency ceiling.

Sizing: ~4 vCPU / 8 GB per worker (Pro max is 8/16). The services bind to localhost, so
tests hit the server over localhost (fast); only Stripe's inbound webhook uses the public
port.

---

## 5a. Base & warm build recipe (native, no Docker — concrete)

> **Port note:** in `dw`, "Redis" (`redis-stack`, `agent-services.sh:14-15`) and "Dragonfly"
> (compose, `dw.compose.yml:9-16`) are separate, but the server points `REDIS_URL`,
> `CACHE_URL`, **and** `CACHE_V2_DRAGONFLY_URL` at the **same** Dragonfly port
> (`env-files.ts:101-104`). On a single-worker µVM, run **one** Dragonfly on `:6379` for all
> three; a second Redis is only needed to mirror the dw split.

**BASE snapshot** (static, built once; rebuilt on lockfile change):

| Component | Source | localhost port | dw ref |
|---|---|---|---|
| PostgreSQL 18 + `pg_trgm` | native `postgresql@18` | 5432 | `agent-services.sh:14,74-87` |
| Dragonfly (Redis proto) | native | 6379 | `dw.compose.yml:9-13`, `ports.ts:9-11` |
| elasticmq-native | GraalVM ElasticMQ | 9324 | `dw.compose.yml:18-22`, `ports.ts:13-15` |
| ClickHouse (if analytics tests) | native | 8123 | `agent-services.sh:16` |
| Bun + `node_modules` | repo-pinned Bun | — | — |

Build: `initdb` a PG18 cluster (role `postgres/postgres` SUPERUSER), `createdb autumn`, then
**`CREATE EXTENSION IF NOT EXISTS pg_trgm`** (mirrors `neon.ts:173` / `agent-services.sh:81`)
— **empty DB, no tables/functions**. Start Dragonfly (`--dir=/var/lib/dragonfly`) and
elasticmq-native with the repo's config declaring both FIFO queues `autumn.fifo` +
`autumn-track.fifo` (`elasticmq.conf:18-27`). `bun install`. Snapshot.

**WARM snapshot** (per run, this exact order):
1. `git checkout <ref>`.
2. `bun install --frozen-lockfile` (delta only — deps baked in base).
3. **Migrate:** `DATABASE_URL=…localhost…/autumn AUTUMN_DB_DIRECT=1 bun db migrate --bootstrap`
   (`--bootstrap` skips the CONCURRENTLY-index guard, required for the 0000 baseline;
   `migrate.ts:34-38`).
4. **Load DB functions (separate step!):** `bun migrate-functions` → `initializeDatabaseFunctions`
   — 10 SQL procs in **dependency order** (`migration.ts:45-56` == `initializeDatabaseFunctions.ts:25-37`):
   helpers (`deductFromRollovers`…`performDeduction`) before consumers (`syncBalances`,
   `syncBalancesV2`, `resetCusEnts`). Migrations do **not** install these.
5. **Seed org (no Stripe):** `bun scripts/setup/setup-test.ts --yes` with local DB injected →
   `createTestOrg`, passing **`createStripeAccount: false`** (see §6a). Persists `UNIT_TEST_AUTUMN_*` keys.
6. **Clean-stop services** for a consistent filesystem snapshot: `pg_ctl -D $PGDATA -m fast stop -w`;
   Dragonfly `SAVE` then `SHUTDOWN NOSAVE`; elasticmq SIGTERM (queues re-declared from config on boot).
7. Snapshot → WARM → fork N.

Worker env URLs (all localhost, **base** ports — dw's `+(worktreeNum-1)*100` offsets are
unnecessary when each worker is its own µVM): `DATABASE_URL`/`DATABASE_CRITICAL_URL` =
`postgresql://postgres:postgres@localhost:5432/autumn`; `REDIS_URL`=`CACHE_URL`=
`CACHE_V2_DRAGONFLY_URL`=`redis://localhost:6379`; `SQS_QUEUE_URL_V2`=
`http://localhost:9324/000000000000/autumn.fifo`; `TRACK_SQS_QUEUE_URL`=`…/autumn-track.fifo`
(`env-files.ts:101-106`).

**Ordering gotchas:** (1) `pg_trgm` must exist **before** migrate — `0000_bumpy_tinkerer.sql:835-880`
creates `gin_trgm_ops` indexes but doesn't create the extension. (2) Functions load **after**
migrations, in the fixed 10-file order. (3) Always `--bootstrap` (fresh single-tenant DB).
(4) Seed before the clean-stop, or workers boot with a partial org.

---

## 6. Stripe per-worker (sub-account + webhook)

Each worker, at boot, does what today's `afterOrgCreated` does for the Stripe half —
extracted into a new per-worker function.

### Refactor: split `afterOrgCreated`
Current `afterOrgCreated` (`server/src/utils/authUtils/afterOrgCreated.ts`) does, in one
shot: created_at update, **Stripe sub-account create + bind** (lines 62–79), Svix app
create + `svix_config`, and pkeys. The `createStripeAccount` flag already lets us skip the
Stripe part.

- **Warm parent** calls the seed with `createStripeAccount: false` (and Svix skipped) →
  org/features/products/keys baked, **no** sub-account.
- **Per-worker** new function `attachSandboxStripeAccount({ db, org, env, publicUrl })`:
  1. `const account = await createConnectAccount({ org, user })` → `acct_X`.
  2. `OrgService.update({ orgId, updates: { default_currency: "usd",
     test_stripe_connect: { default_account_id: account.id } } })` — into the worker's
     **local** DB.
  3. Re-read org, then register the webhook **on the sub-account**:
     ```
     const stripeCli = createStripeCli({ org, env });            // sub-account-scoped
     await stripeCli.webhookEndpoints.create({
       url: `${publicUrl}/webhooks/stripe/${org.id}/${env}`,      // legacy route
       enabled_events: WEBHOOK_EVENTS,                            // MAIN + SYNC
       // NOTE: no `connect: true` — endpoint lives on the sub-account
     });
     ```
     This is deliberately **not** `registerConnectWebhook` (that one creates a
     `connect: true` platform endpoint → fan-out). With `STRIPE_WEBHOOK_SKIP_VERIFY=true`
     we **skip** `updateConnectWebhookSecret`.

`publicUrl` comes from the dispatcher: after forking, it reads `sandbox.domain(SERVER_PORT)`
and passes the URL into the worker's boot command as an argument (env is fixed at fork
time, before the URL is known; the URL is a boot arg).

### GC (important — Stripe state outlives the ephemeral DBs)
Every run creates N sub-accounts + N webhook endpoints under the one platform account.
The local DBs die, but Stripe state does **not**. Must:
- On worker teardown: delete the sub-account (removes its webhook with it).
- A sweeper (cron / `bun tw --gc`) that deletes orphaned test sub-accounts from crashed
  runs (e.g. by display-name/metadata tag + age).

### Provisioning burst
Creating N sub-accounts + N webhooks at run start are **writes against the platform
account** (the one place still shared). At N≈50–200 this is a small burst; stagger worker
boot to respect the platform rate limit + Vercel's 200 vCPU/min allocation ramp. Test
**execution** is per-sub-account isolated; only this brief setup touches the platform.

---

## 6a. `attachSandboxStripeAccount` — implementation spec

Per-worker, this does the Stripe half of `afterOrgCreated` the warm parent now skips: create a
sub-account, bind it locally, register a webhook **on the sub-account** (scoped client, **no
`connect:true`**) at the legacy route.

Why it routes correctly (verified): binding `test_stripe_connect.default_account_id` (not
`account_id`) with no `master_org_id` makes `orgToAccountId` return the account
(`connectUtils.ts:22`) and `shouldUseMaster` stay false (`connectUtils.ts:84-87`), so
`createStripeCli` → `initMasterStripe({ accountId })` =
`new Stripe(STRIPE_SANDBOX_SECRET_KEY, { stripeAccount })` (`createStripeCli.ts:68-87`,
`initStripeCli.ts:53-54`). The legacy seeder rebuilds the same client at
`stripeLegacySeederMiddleware.ts:97`.

```ts
export const attachSandboxStripeAccount = async ({ db, org, user, env, publicUrl }) => {
  // 1. sub-account via master sandbox key (createConnectAccount.ts:23,43)
  const account = await createConnectAccount({ org, user });
  // 2. bind in LOCAL db — default_account_id, NO master_org_id (OrgService.update clears org cache)
  const updatedOrg = await OrgService.update({ db, orgId: org.id, updates: {
    default_currency: "usd",
    test_stripe_connect: { ...(org.test_stripe_connect ?? {}), default_account_id: account.id },
  }});
  // 3. sub-account-scoped client off the UPDATED org (stale org throws createStripeCli.ts:90)
  const stripeCli = createStripeCli({ org: updatedOrg!, env });
  // 4. webhook ON THE SUB-ACCOUNT, legacy route, NO connect:true
  await stripeCli.webhookEndpoints.create({
    url: `${publicUrl}/webhooks/stripe/${org.id}/${env}`,
    enabled_events: [...MAIN_STRIPE_EVENT_TYPES, ...SYNC_STRIPE_EVENT_TYPES],
  });
  // 5. skip secret storage — skip-verify means the seeder never reads it
};
```

**Event set:** use `MAIN + SYNC` (`stripeConstants.ts:6,25`), **not** the lean `WEBHOOK_EVENTS`
const (`constants.ts:33-47`) that `registerConnectWebhook` uses — it omits `customer.updated`
and all `SYNC_*` (payment_method/product/price/payment_intent/invoice.payment_failed) that the
sync middleware in the legacy chain needs (`stripeWebhookRouter.ts:24`). Matches
`stripeOnboardingUtils.ts:36`.

**Warm-parent change:** flip `createTestOrg.ts:158` (`createStripeAccount: true`→`false`) and
`:77` (existing-org guard → `false`), gated behind worker mode so `bun t`/`dw` keep their shared
account. `afterOrgCreated` already gates the whole Stripe block on this flag
(`afterOrgCreated.ts:62-79`).

**GC:** reuse `deleteConnectedAccount` → `masterStripe.accounts.del(accountId)`
(`connectUtils.ts:57-73`). `createConnectAccount` only sets `display_name: org.name` today (no
metadata) — add `metadata: { autumn_test:"true", autumn_test_run_id, autumn_created_at }` so the
sweep is precise. Sweep: iterate `stripe.accounts.list({ limit:100 })`, delete where
`metadata.autumn_test==="true"` && older than a cutoff (mirror the age-guard posture of
`OrgService.listPreviewOrgsForDeletion:481-505`). Deleting the account drops its account-scoped
webhook automatically. Null out the local `default_account_id` if a worker org is reused.

**Gotchas:** (a) **`NODE_ENV` must NOT be `production`** on workers, or skip-verify disables and
the seeder demands a secret we never stored (`stripeLegacySeederMiddleware.ts:56-58`). (b) Pass
the **post-update** org to `createStripeCli` (stale org → "no Stripe account linked" throw).
(c) `${org.id}` in the URL is **load-bearing** — the legacy route resolves the org from the
path, not `event.account`. (d) `createConnectAccount` uses the **v2** create call, so
`account.id` may be a v2 id; confirm `accounts.del` + the `stripeAccount` header accept it, else
fall back to v2 `accounts.close`.

**Who runs this (see §9a):** for recoverable cleanup the **orchestrator** runs steps 1 & 4 (create
sub-account + register webhook) and records the ids in the run registry *before* anything can fail;
the **worker** runs only step 2 (bind `default_account_id` into its localhost DB). Same code, split
by where the platform key vs the DB live — so a worker dying mid-bring-up can't orphan an untracked
sub-account.

---

## 7. Svix gating — detection, provisioning, GC

> **⚠️ Correction to an earlier assumption: the Svix tests ARE in core.** **26** test files
> import the Svix util; **17 of them are in `core`** — the entire `autumn-webhooks/` tree is
> pulled in via `coreBillingOthers.ts:24` (bare `"autumn-webhooks"` path, resolved recursively)
> → `core.ts` → the `pre-merge` suite (`suites.ts:6`). So **every core/pre-merge run requires
> Svix-provisioned workers** — this is not a rare out-of-band case. The other 11 are domain-only
> (`balances/track/usage-alerts/*`, `limit-reached/*`, `auto-topup/*`, `revenuecat`).

These tests verify **outbound** webhooks: Autumn fires into Svix → Svix Play inbox → the test
polls Play. They need the org's `svix_config.sandbox_app_id` to point at a real Svix app and a
valid `SVIX_API_KEY`. Some (e.g. the "Stripe-initiated cancel" case) also exercise the
**inbound** Stripe path, so a Svix worker needs both §6a and this.

**Detection — static import scan (exact).** A file needs Svix iff it imports
`@tests/integration/utils/svixWebhookTestUtils`. Verified exact: there's one entrypoint, all 26
importers also import `getTestSvixAppId` (which throws if `svix_config.sandbox_app_id` is unset,
`svixWebhookTestUtils.ts:245-257`), direct import (no barrel) — a one-hop grep over each assigned
`.test.ts` has zero false positives/negatives.

**Env var: `SVIX_API_KEY`** (the single var read by both the test client `svixWebhookTestUtils.ts:14-24`
and the server `createSvixCli()` `svixUtils.ts:5-7`). Absent → the test client throws and
`safeSvix`/`sendSvixEvent` no-op — which is exactly why non-Svix workers can leave it unset and
stay fully isolated.

**Provisioning.** Reuse `afterOrgCreated`'s `initOrgSvixApps` (`afterOrgCreated.ts:14-34,82-98`)
→ `createSvixApp` (`svixHelpers.ts:7-31`, tags `metadata { org_id, env }`); only `sandbox_app_id`
is consumed, so one sandbox app per Svix worker suffices. Note today's test org is fetched by slug
at preload and the preload does **not** create a Svix app — so a Svix worker must run a
`createSvixApp` + `OrgService.update({ svix_config })` step after its org row exists.

**Recommendation — one dedicated svix shard.** Route **all** 26 Svix files onto a **single
dedicated "svix shard"** (build-time partitioner: bucket Svix files onto that one worker, the rest
onto the general pool). They're simple, fast tests, so one worker running them sequentially is fine,
and a single shard means exactly **one** `createSvixApp` + one `SVIX_API_KEY` worker per run —
minimal Svix-account churn, zero racing into `application.create`. Provision + GC that one shard per
run; keep `SVIX_API_KEY` unset on every other worker (they stay fully isolated from Svix).

**External deps (only these shards):** Svix API (`api.svix.com`, app/event-type/endpoint/message)
and Svix Play (`api.play.svix.com`, ephemeral unauthenticated inboxes). Acceptable because exposure
is proportional to the fixed shard count, not the pool.

**GC:** per-endpoint `cleanup()` → `svix.endpoint.delete` in `afterAll`
(`svixWebhookTestUtils.ts:178-192`); per-app `deleteSvixApp` → `svix.application.delete`
(`svixHelpers.ts:33-39`) at shard teardown (or tag-sweep via `metadata.org_id`).

---

## 8. The runner — reuse the existing window, swap the executor

The sliding-window concurrency, the parser, the result model, the auto-retry phase, and
the Ink TUI **already exist** in `scripts/testScripts/runTestsV2.tsx`. `bun tw` does **not**
introduce a scheduler — it replaces exactly one leaf: the function that today spawns a
local `bun test <file>`. Everything above that leaf (queueing, retry, rendering) is reused
unchanged.

### 8.1 What `runTestsV2.tsx` does today
- **The window is plain `p-limit`, not a custom scheduler.** `runAllTests`
  (`runTestsV2.tsx:692-808`) does `const limit = pLimit(maxParallel)` (`:694`) and maps
  every file through it (`:697-703`). `maxParallel` comes from `--max=N` / env
  `TEST_FILE_CONCURRENCY` / `testRunConfig` (`:1061-1071`, `testDispatcher.ts:327-337`).
  `pLimit` already gives exact sliding-window semantics: ≤ `maxParallel` files in flight,
  a slot freed the instant one settles, next queued file admitted automatically. **For the
  pool, `maxParallel === N workers`** — this is the "already exists" piece.
- **The local executor — `runTestFile` (`:295-429`)** is the *only* thing to swap. It
  builds `["bun","test","--timeout","0", (--test-name-pattern …), file]` (`:322-331`),
  `spawn(..., { env: { ...process.env } })` (`:333-337`), streams stdout chunk-by-chunk
  re-running the parser + `onUpdate` on every chunk (`:349-368`), drains stderr (`:370-380`),
  awaits `proc.exited` (`:382`), and computes `isFailed = hasFailures || exitedNonZero`
  (`:390-399`) → returns a `TestFileResult` (with `crashError` when 0 tests, `:401-415`).
- **The parser — `parseTestOutput` / `extractCurrentTest` (`:119-252`)** are pure
  `string -> result` functions over Bun's `(pass)/(fail)` lines. **They don't care where
  the bytes came from** — the other half of the seam.
- **The result model — `TestFileResult` (`:95-113`)** (`pending|running|passed|failed|
  retry_queued|retrying`, `tests`, `firstAttemptFailures`, `attempt`, `passedOnRetry`,
  `crashError`) is the contract between executor, retry, and TUI. Stays identical.
- **Auto-retry (`:705-769`)**: filters `failed && attempt===1`, marks `retry_queued`, runs
  them through a second `pLimit(maxParallel)` (`:729`), passing `failedTestNames` back as
  `--test-name-pattern` (whole-file retry if a name contains `(unnamed)`, `:735-740`).
- **Ink TUI (`TestRunnerApp :592-931`)** is decoupled via a 100ms ref-flush throttle
  (`:635-689`); completed files append to `<Static>`, live rows re-render below. Untouched.

### 8.2 The seam — a `TestExecutor` injected into `runTestFile`
```ts
interface TestExecutor {
  run(args: {
    file: string;
    failedTestNames?: string[];        // -> --test-name-pattern, reused as-is
    onChunk: (text: string) => void;   // raw bytes -> existing parser
    signal?: AbortSignal;
  }): Promise<{ exitCode: number; stderr: string }>;
}
```
`runTestFile` keeps 100% of its parsing / `onUpdate` / result-assembly (`:342-415`) and only
delegates the byte source. The remote executor: acquires an idle worker (one in-flight file
== one worker, since `pLimit(N)` never admits more than `N`), sends
`bun test --timeout 0 [--test-name-pattern …] <file>` over the worker's command channel,
pipes stdout frames into `onChunk` (→ same `parseTestOutput`), resolves on command-complete.
"Dispatcher streams files to idle workers" **is** `pLimit(N)` + the executor checking out the
next free worker. (For per-worker concurrency `K > 1`: set the window to `N*K` and let the
pool admit `K` concurrent `run()` per worker.)

### 8.3 Retries map for free
No new mechanism — the Phase-2 `retryLimit` loop (`:730-768`) re-submits failed files through
a fresh `pLimit` and reuses `--test-name-pattern`. Under `bun tw` that's literally
`retryLimit(() => executor.run(...))` landing on the next free worker. `(unnamed)`
whole-file fallback and `passedOnRetry` carry over verbatim.

### 8.4 The genuinely NEW concern: worker death mid-file (≠ test failure)
A worker dying mid-file (µVM evicted, channel closed, no exit code) is **not** a
`TestFileResult: failed` — the file got no verdict, and re-parsing partial output would
invent a bogus result. Surfaces at the point that replaces `await proc.exited` (`:382`): the
remote `run()` must distinguish *clean completion* (real exit code → existing path) from
*worker death* (transport closed, no code → transient infra fault). Reschedule rules, which
have **no analogue** in the local runner:
- **Attempt-preserving** — re-submit through the **same `limit(...)`** at the *same* attempt
  number (don't consume the auto-retry budget, don't mark `failed`).
- **Evict + replace the dead worker** (spin a fresh sandbox) before its slot is reusable.
- **Cap reschedules per file** (e.g. N) so a flapping worker can't re-queue one file forever.

### 8.5 Current assumptions that bake in local execution (need adjusting)
- **Env:** `spawn(..., { env: { ...process.env } })` (`:336`) ships the local env (incl.
  Infisical secrets, `package.json:96`) to the child. Workers don't inherit `process.env` —
  serialize + transmit the needed env per worker, and reproduce the `preload`
  (`scripts/preload-env.ts`, `testDispatcher.ts:29-30`) inside the worker image.
- **Paths:** `runTestFile` passes an **absolute local path** (`:331`); `collectTestFiles`
  resolves against `process.cwd()` (`:280`). Workers have a different root — translate to the
  worker-relative repo path (repo checked out at the matching commit), and rewrite remote
  stack-trace paths back to local so `toClickablePath` (`:455-461`) stays clickable.
- **Exit codes:** `exitCode !== 0` (`:392`) conflates "tests failed" and "crashed" — fine
  locally, but the remote path must **not** let worker-death masquerade as a non-zero exit
  (§8.4). The code must come from the test command *on the worker*, not the transport.
- **Output timing:** the ~10fps live UX assumes small frequent stdout chunks (`:350`); a
  network transport may coalesce frames (parser is order-tolerant so correctness holds, UX
  lags). stderr is drained *after* stdout closes (`:370`) — a multiplexed remote channel may
  need a single merged stream into `output`.
- **SIGINT:** `runningProcesses` + `proc.kill(9)` (`:67-83`) only kills local children —
  replace with "cancel in-flight workers / tear down sandboxes" or Ctrl-C leaks µVMs.

**Bottom line:** keep `pLimit(maxParallel)` (now `N`), the parser, `TestFileResult`, the
retry phase, and the entire Ink layer exactly as-is; replace only `runTestFile`'s byte source
with a `TestExecutor`; add one new branch — worker-death → attempt-preserving reschedule +
pool eviction.

### 8.6 CLI shape (mirrors `bun t`)
```
bun tw [group|suite|pattern …] [--workers=N] [--per-worker=K] [--ref=<git-ref>] [--keep]
bun tw list                 # this user's runs + orphans (§9a)
bun tw kill <runId>         # tear down one run's resources
bun tw kill-all             # tear down all of THIS user's non-completed runs
bun tw kill --orphans       # tag-sweep fallback for SIGKILL'd runs
```
- `--workers=N` pool size (the knob → `maxParallel`); auto-capped to `min(N, fileCount)` (§8.7).
  `--per-worker=K` per-worker file concurrency (window becomes `N*K`).
- `--ref` defaults to current `HEAD` (must be resolvable for the warm checkout). `--keep`
  leaves the pool up for debugging (clean up later with `bun tw kill`).
- Group/file resolution reuses `server/tests/_groups/` exactly as `bun t` does.

### 8.7 Pool sizing & idle workers (the odd/evens)
- **Never over-provision.** Provision `min(N, fileCount)` workers (with `K`,
  `min(N, ceil(fileCount/K))`). Fewer files than workers → the extras would cost a sub-account +
  provisioning for nothing.
- **Idle ≠ torn down.** As the queue drains, workers go idle (near the tail, most are). Keep them in
  the pool — on Vercel's active-CPU billing an idle µVM is ~free (memory only), and they're the pool
  the retry phase draws from. Tear the whole pool down only after **all files + retries settle**
  (§9 step 7).
- **Retry / reschedule on a *different* worker (your instinct — yes).** Track which worker last ran
  each file; on a retry (test failure) or a worker-death reschedule (§8.4), prefer a *different*
  idle worker. A worker can accumulate local bad state across its ~6 files (a polluted row, a leaked
  test clock, a throttled sub-account); a different worker is a clean shot, and tests are
  self-contained (unique customer ids + own `initScenario` seed) so there's zero cross-worker
  dependency. Fall back to the same worker only when it's the only one (`N==1`); worker-death *must*
  use a different one.
- **(Optional, future) hedge the tail.** Near the end, idle workers vastly outnumber remaining
  files — a flaky/slow file could run **redundantly** on a second idle worker, taking the first
  green result. Out of scope for v1; the idle pool makes it nearly free if wanted later.

---

## 9. Lifecycle (one `bun tw` invocation)

1. **Resolve** files from args via `_groups`; compute `needsSvix` set.
2. **Auth** to Vercel (OIDC token from `.env.local`; see §10).
3. **Warm-up (serial, once):** fork base → checkout `--ref` → `bun install --frozen` →
   `bun db migrate` (**fail-fast**) → seed org/features/products (`createStripeAccount:false`,
   Svix skipped) → clean-stop services → `snapshot()` → `warmSnapshotId`.
4. **Fan-out:** fork `N` workers from `warmSnapshotId` (`persistent:false`, `ports:[SERVER_PORT]`,
   `timeout`, per-worker `env`). Stagger to respect rate ramps.
5. **Per-worker boot:** start services → read `sandbox.domain(SERVER_PORT)` → run boot cmd
   with the URL → `attachSandboxStripeAccount` (+ Svix if flagged) → signal ready.
6. **Run:** dispatcher streams files to ready workers (sliding window), renders TUI,
   retries failures.
7. **Teardown:** for each worker, delete Stripe sub-account (+ Svix app if any) →
   `sandbox.delete()`. Then optionally delete `warmSnapshotId`. `--keep` skips teardown.
8. **Report:** final pass/fail summary; surface per-shard `activeCpuUsageMs` (from
   `stop()`/`delete()`) for cost visibility.

---

## 9a. Cancellation, ownership tagging & cleanup (the escape hatch)

Resources outlive the process (Vercel sandboxes, Stripe sub-accounts, the one Svix app), and a
dev's machine can die mid-run. The escape hatch makes **every** created resource recoverable, scoped
to the OS user so teammates sharing the Vercel project + the single Stripe platform account never
step on each other.

**Ownership tag.** Read the OS username once (`os.userInfo().username`, e.g. `amianthus`) and stamp
it on everything:
- **Vercel sandbox `name`**: `tw-<user>-<runId>-<idx>` (names are unique per project) + Vercel
  **tags** `{ owner: <user>, run: <runId>, kind: "bun-tw" }`.
- **Stripe sub-account**: `metadata { autumn_test:"true", autumn_tw_owner:<user>, autumn_tw_run:<runId> }`
  (extends the §6a GC tag).
- **Svix app**: `metadata { autumn_tw_owner:<user>, autumn_tw_run:<runId> }`.

**Run registry (authoritative cleanup record).** Mirror dw's `~/.autumn-worktrees.json` pattern:
`~/.autumn-tw/registry.json`, one entry per run: `{ runId, owner, startedAt, status, ref,
sandboxes:[{name,id}], subAccounts:[acctId], svixAppId, webhooks:[…] }`. Written **incrementally as
resources are created**, marked `completed` on clean teardown. This — not provider listing — is the
primary source of truth for `list`/`kill`; tags are the fallback when an entry is missing.

**Creation is orchestrator-driven** (so nothing is ever orphaned beyond recovery — see §6a note):
the orchestrator creates + records the sub-account/webhook/svix-app ids *before* the worker does
anything that can fail; the worker only binds the acct id into its localhost DB.

**Ctrl+C guard (#1).** Replace runTestsV2's local-only SIGINT handler (`:67-83`, just `kill(9)` of
child procs) with a dispatcher-level `SIGINT`/`SIGTERM` handler:
- **First Ctrl+C:** stop scheduling, print "tearing down M workers…", run the teardown sequence,
  mark the registry entry `completed`, exit 130. Best-effort and **time-boxed per resource** so a
  hung sandbox can't block exit.
- **Second Ctrl+C:** force-exit immediately, leaving resources up — registry + tags persist, so
  `bun tw kill` recovers. This is the irrecoverable-cancel escape hatch.
- A `kill -9` runs nothing — exactly the case the registry + `kill --orphans` exist for.

**Teardown sequence (#4 — identical for natural end and kill; idempotent, orchestrator-driven from
recorded ids, tolerant of "already deleted"):**
1. (best-effort) cancel the in-flight test command on the worker.
2. **Stripe**: `deleteConnectedAccount` → `accounts.del(acctId)` (drops its account-scoped webhook
   automatically; on failure, `webhookEndpoints.del` then retry).
3. **Svix** (svix shard only): `deleteSvixApp` → `application.delete(appId)`.
4. **Vercel**: `sandbox.delete()`.
5. Mark the resource removed in the registry.

Running Stripe/Svix from the **orchestrator** (not the sandbox) means a dead sandbox's sub-account
still gets cleaned up.

**`bun tw list` / `kill` / `kill-all` (#2, #3):**
- **`list`**: read the registry, filter `owner === currentUser`, show each run's status + whether it
  was cleanly torn down (orphans = `status != completed` or sandboxes still alive). Cross-check
  Vercel (name prefix `tw-<user>-` / `owner` tag) + Stripe (`metadata.autumn_tw_owner === user`) to
  surface anything the registry missed.
- **`kill <runId>`**: teardown sequence for every resource in that run, then drop the entry.
- **`kill-all`**: same for **all of the current user's** non-`completed` runs. Default scope is the
  current OS user (never nuke a teammate's live swarm); `--all-users` requires explicit confirmation.
- **`kill --orphans`**: tag-sweep fallback — list Stripe accounts + Vercel sandboxes by `owner` tag
  older than a cutoff and delete; catches resources from SIGKILL'd runs that never reached the
  registry.

---

## 10. Vercel specifics & auth

- **SDK:** `@vercel/sandbox`. Key calls: `Sandbox.create`, `Sandbox.fork({ sourceSandbox })`,
  `sandbox.snapshot()`, `sandbox.domain(port)`, `sandbox.runCommand(..., { stream/detached })`,
  `sandbox.extendTimeout()`, `sandbox.update({ ports, timeout, currentSnapshotId })`,
  `sandbox.stop()` / `sandbox.delete()`.
- **`fork()` does not copy `env`** — pass per-worker env explicitly each fork. The public
  URL is **not** an env var (unknown at fork); it's a **boot-command argument**.
- **Ports:** declare `ports: [SERVER_PORT]` at create so `domain()` works; internal
  services stay on localhost (not exposed). 1 of 15 ports used; PG never public.
- **Timeout:** default 5 min is too short for a multi-file worker; set e.g. 30–60 min and
  `extendTimeout` if needed (Pro ceiling 24h).
- **vCPU:** default 2; set ~4 (→ 8 GB) for the stack.
- **Region:** `iad1` only — fine (Stripe/Svix/GitHub global; orchestrator is local).
- **Auth (verified):**
  - Local dev: `vercel link` + `vercel env pull` → `VERCEL_OIDC_TOKEN` in `.env.local`.
    **Token expires after 12h** — re-run `vercel env pull` on auth errors. A long
    `bun tw` run (minutes) is well within 12h, so a token pulled at start is fine.
  - CI / non-Vercel: access token via `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID`.
  - `bun tw` one-time setup on a fresh machine: link the Vercel project + `vercel env pull`.

---

## 11. Secrets model (minimal, no Infisical in sandboxes)

Goal: workers are self-contained except for the irreducible Stripe (and optional Svix)
secrets. Do **not** run `infisical` in N sandboxes.

- **Resolve secrets once on the orchestrator** (it can use Infisical locally) and inject
  the minimal set as `env` at fork:
  - `STRIPE_SANDBOX_SECRET_KEY` (platform key — to create sub-accounts + register webhooks).
  - `STRIPE_WEBHOOK_SKIP_VERIFY=true`, `NODE_ENV` ≠ production.
  - `SVIX_API_KEY` — **only** for `needsSvix` workers.
  - `ENCRYPTION_PASSWORD` / `ENCRYPTION_IV` **only if** a code path the tests hit decrypts
    something (skip-verify avoids the webhook-secret path; audit other usages).
  - Local service URLs (`DATABASE_URL=localhost`, `REDIS_URL`, `CACHE_V2_DRAGONFLY_URL`,
    `SQS_QUEUE_URL_V2`, `TRACK_SQS_QUEUE_URL`) — all localhost, baked or set at boot.
  - `UNIT_TEST_AUTUMN_SECRET_KEY` / public key — baked into the warm snapshot via the seed.
- **Resolved — see §11a** for the concrete list. The 6 hard boot gates are `DATABASE_URL`,
  `DATABASE_CRITICAL_URL`, `ENCRYPTION_IV`, `ENCRYPTION_PASSWORD`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`; the three encryption/auth secrets are the non-obvious must-bakes (dw pulls
  them from Infisical and never writes them). Everything else is feature-guarded and degrades.

---

## 11a. Minimal server boot env (concrete)

There's **no central env schema** — the only hard boot gate is `checkEnvVars()` at the top of
`init.ts:51`. Everything else (Redis, SQS, Stripe, Sentry, OTel, Trigger, Svix, Supabase, Resend)
is `if (process.env.X)`-guarded or lazy-throws only when used, so it degrades, doesn't block boot.
Run workers in the dev single-process path (`NODE_ENV=development`); env arrives via
`preload-env.ts` → `loadLocalEnv()` reading `server/.env`; `initInfisical()` no-ops without creds.

**The 6 hard requirements (server won't boot without them):**

| Var | Gate | In `bun tw` |
|---|---|---|
| `DATABASE_URL` | `exit(1)` (`initUtils.ts:5-8`) | localhost |
| `DATABASE_CRITICAL_URL` | critical pool at module load (`initDrizzle.ts:154`); code reads `DATABASE_CRITICAL_URL`, **not** `.env.example`'s `CRITICAL_DATABASE_URL` | localhost (= `DATABASE_URL`) |
| `ENCRYPTION_IV` | `exit(1)` (`initUtils.ts:10-15`) | **bake** |
| `ENCRYPTION_PASSWORD` | `exit(1)` | **bake** |
| `BETTER_AUTH_SECRET` | `exit(1)` (`initUtils.ts:27-30`) | **bake** |
| `BETTER_AUTH_URL` | `exit(1)` | localhost |

**Non-obvious must-bakes:** `ENCRYPTION_IV`, `ENCRYPTION_PASSWORD`, `BETTER_AUTH_SECRET` are hard
gates but dw does **not** write them (it pulls them from Infisical) — easiest to forget.
`ENCRYPTION_IV`/`PASSWORD` must match whatever encrypted any Stripe keys held in seeded org rows.

**Bottom line for the worker image:**
- **Bake (fixed, every worker):** `ENCRYPTION_IV`, `ENCRYPTION_PASSWORD`, `BETTER_AUTH_SECRET`,
  `STRIPE_WEBHOOK_SKIP_VERIFY=true`, `UNIT_TEST_AUTUMN_PUBLIC_KEY` (constant `am_pk_test_3DoBu1…`).
- **localhost (VM's own daemons):** `DATABASE_URL`, `DATABASE_CRITICAL_URL`, `BETTER_AUTH_URL`,
  `REDIS_URL`, `CACHE_URL`, `CACHE_V2_DRAGONFLY_URL`, `SQS_QUEUE_URL_V2`, `TRACK_SQS_QUEUE_URL`,
  `AUTUMN_TEST_BASE_URL`, `SERVER_PORT`.
- **Inject per-worker:** `STRIPE_SANDBOX_SECRET_KEY` (Connect platform key),
  `UNIT_TEST_AUTUMN_SECRET_KEY` + `TESTS_ORG` (output of the per-VM seed); `SVIX_API_KEY` only for
  Svix shards (§7a).
- **Drop entirely:** all Infisical, ngrok, emulate/Google-OAuth, Slack, Svix (unless needed),
  Supabase, Resend, Sentry, Axiom/OTel, Trigger, Anthropic, AWS creds (elasticmq needs none),
  `NODE_EXTRA_CA_CERTS`, Stripe live + client-id + webhook-secret.

AWS creds can stay empty — SQS clients default region `us-east-2`/empty creds and the elasticmq
endpoint derives from the queue URL (`initSqs.ts:30-37`).

---

## 12. Failure modes & mitigations

| Failure | Mitigation |
|--------|------------|
| Bad migration in the ref | Fails in warm-up, **before** fan-out; abort + show error. Zero workers spawned. |
| Worker dies mid-file (OOM/blip) | Detect via SDK; reschedule the file; respawn/replace worker. Distinct from test failure. |
| Webhook latency (Stripe→iad1→worker) | Higher than localhost `stripe listen`. Audit harness `waitForWebhook` budgets (15–20s); bump if tight. |
| Stripe sub-account / webhook / Svix-app accumulation | Orchestrator-driven teardown from the run registry; `bun tw kill --orphans` tag-sweep by `owner` + age (§9a). |
| Run cancelled / orchestrator SIGKILL'd mid-run | All resources are `owner`+`run` tagged and in `~/.autumn-tw/registry.json`; Ctrl+C tears down gracefully (2nd Ctrl+C force-exits, still recoverable), then `bun tw list` → `kill`/`kill-all`/`kill --orphans` (§9a). |
| Svix limits | Gate by `needsSvix`; only a handful of workers ever create apps; delete on teardown. |
| Provisioning burst on platform account | Stagger worker boot; respect Stripe + Vercel 200 vCPU/min ramp. |
| Accumulated DB state across files on one worker | Tests use unique customer ids (safe); flag any test asserting global counts; reset via `clearOrg`/`setupOrg` between files/batches if needed. |
| OIDC token 12h expiry | Pull at run start; runs are minutes, well within. |

---

## 13. Cost (rough)

A full ~1,264-file run, ~4 vCPU / 8 GB workers, mostly I/O-bound on Stripe:
- Vercel bills **active CPU only** → a file that's 80% Stripe-wait bills ~20% CPU.
- Ballpark **single-digit dollars per full-suite run** (plus the one warm-up build).
- Cost is **not** the deciding constraint; optimize for correctness, speed, DX. Track real
  spend via `activeCpuUsageMs` returned from `stop()`/`delete()`.

---

## 14. Open questions / spikes (do these before building the swarm)

1. **One-worker end-to-end spike (highest priority):** one Vercel sandbox, baked stack,
   one sub-account, public URL registered on the sub-account → trigger a real Stripe
   event → confirm it lands on `/webhooks/stripe/<orgId>/sandbox` and the middleware
   fires. Run `core-attach` on it green.
2. **Service cold-start from a forked filesystem:** confirm PG18 / Dragonfly /
   `elasticmq-native` start cleanly from the clean-stopped, snapshotted data dirs across
   many forks (no recovery hangs).
3. **Webhook round-trip latency** vs the harness's `waitForWebhook` timeouts.
4. **~~Minimal boot env discovery~~ — done (§11a).** Remaining empirical check: confirm the
   baked `ENCRYPTION_IV`/`ENCRYPTION_PASSWORD` are self-consistent within a run (only matters if
   any seeded row holds an encrypted Stripe value; the warm parent uses `createStripeAccount:false`
   so likely none).
5. **Per-worker concurrency `K` tuning:** how hard can one sub-account + one µVM push
   before its own rate limit / CPU is the bottleneck.
6. **State reset cadence** between files on a long-lived worker (none vs per-file
   `clearOrg`).

---

## 15. Phased rollout

1. **Spike** — manual one-worker E2E (§14.1–14.3). Prove the webhook path + service
   restore + a real test group passing.
2. **MVP** — `bun tw` with a small fixed pool (`N` small), warm-up + fork + per-worker
   Stripe attach + sequential file dispatch + basic TUI. No retries/GC yet.
3. **Pool + sliding window** — full dispatcher, `--workers=N`, retries, worker-death
   reschedule, Svix gating.
4. **Hardening** — GC/sweeper, base-snapshot rebuild automation (lockfile hook + nightly),
   cost reporting, `--keep`/debug ergonomics.
5. **Adopt** — wire into the pre-merge flow; keep `bun t` for local single-file iteration.

---

## Appendix: relevant existing code

- Runner/TUI: `scripts/testScripts/runTestsV2.tsx`, dispatcher
  `scripts/testScripts/testDispatcher.ts`, config `scripts/testScripts/testRunConfig.ts`.
- Groups: `server/tests/_groups/` (`index.ts`, `core/`, `domains/`, `suites.ts`).
- Test bootstrap: `server/tests/setup-integration-tests.ts`,
  `server/tests/utils/testInitUtils/createTestContext.ts`, `…/initScenario.ts`.
- Org seed: `scripts/setupTestUtils/createTestOrg.ts`, `scripts/setup/setup-test.ts`,
  `server/src/utils/authUtils/afterOrgCreated.ts`.
- Stripe: `createConnectAccount.ts`, `external/connect/createStripeCli.ts`,
  `external/connect/initStripeCli.ts`, `external/connect/registerConnectWebhook.ts`
  (template for the *connect* path — we adapt to a sub-account endpoint),
  webhook router `external/stripe/stripeWebhookRouter.ts`, seeders
  `external/stripe/webhookMiddlewares/stripe{Legacy,Connect}SeederMiddleware.ts`,
  events `external/stripe/common/stripeConstants.ts` (`WEBHOOK_EVENTS`).
- `dw` (extract core, drop worktree/Neon/ngrok/tmux scaffolding):
  `scripts/dw/helpers/neon.ts:173` (the `pg_trgm` template seed), `scripts/dw/`.
- Svix test example: `server/tests/integration/billing/autumn-webhooks/customer-products-updated.test.ts`,
  utils `server/tests/integration/utils/svixWebhookTestUtils.ts`.
