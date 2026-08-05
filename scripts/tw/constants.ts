import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TwEnv } from "./types.ts";

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");

/**
 * Run registry location. Mirrors dw's `~/.autumn-worktrees.json` pattern, but a
 * directory so the swarm can stash auxiliary state alongside the registry json
 * if needed. See plan §9a.
 */
export const REGISTRY_DIR = join(homedir(), ".autumn-tw");
export const REGISTRY_FILE = join(REGISTRY_DIR, "registry.json");

/**
 * Vercel sandbox `name` prefix. Full name is `tw-<owner>-<runId>-<idx>` (plan
 * §9a). Names are unique per Vercel project, so the prefix doubles as the
 * tag-sweep fallback selector for `kill --orphans`.
 */
export const SANDBOX_NAME_PREFIX = "tw";

/**
 * Pool size `N` default (`--max`). Auto-capped to file count, so small runs stay
 * small — this number only bites on a full-suite run.
 *
 * Sized to give the `core` suite (~405 files) ONE FILE PER WORKER. At the old 200
 * every worker ran 2–3 files concurrently on its single 2-vCPU µVM (one server +
 * PG + Dragonfly + goaws between them) AND split one Stripe budget three ways.
 * The math (152-key pool, budget divided by `ceil(workers / keys)` — see
 * `stripeBudgetForRun`):
 *
 *   200 workers → 2 workers/key → 7 req/s each → 14 req/s per key,
 *                 ÷3 concurrent files → ~2.3 req/s per FILE
 *   405 workers → 3 workers/key → 4 req/s each → 12 req/s per key,
 *                 ×1 file        → 4 req/s per FILE
 *
 * So going wider RAISES per-file Stripe throughput (~1.7×) while LOWERING the
 * per-key load — Stripe is not the binding constraint, and cost is roughly
 * `sandboxes × wall`, so more workers finishing sooner is close to cost-neutral
 * (idle workers are culled within seconds anyway).
 *
 * The real cost of going wider is the persistent Stripe sub-account POOL: the
 * first run at this width top-up-creates the shortfall under the global claim
 * lock (one-time, ~1 min), after which claims reuse. Drop back with `--max=200`.
 */
export const DEFAULT_WORKERS = 450;

/**
 * Per-worker file concurrency `K` default (`--per-worker`). Each worker hosts one
 * server + PG + Dragonfly + goaws and runs up to `K` org-isolated test files at
 * once (the pool admits a worker while `inFlight < K`, least-loaded first); total
 * in-flight is `workers × K`, the rest queue. 3 keeps a worker busy without
 * thrashing its single server+PG; tune via `--per-worker`.
 */
export const DEFAULT_PER_WORKER = 3;

/**
 * Max concurrent Stripe Connect sub-account creations. `accounts.create` is a
 * PLATFORM-account write; bursting all N at once eventually gets 429'd, so cap
 * concurrency (+ retry/backoff in stripe.ts). Plan §6a "provisioning burst".
 *
 * Benchmarked (50 accounts, ramping concurrency): 5 → 37s, 10 → 20s, 15 → 14s,
 * 20 → 11s (0 429s), 25 → 8.7s (0 429s), 30 → 8.7s but 429s start and there's no
 * further speedup. So the wall is ~25–30 concurrent. Default 20 sits comfortably
 * below it (≈11s, zero throttling, headroom); push higher with --stripe-concurrency
 * if you want ~8s and don't mind brushing the limiter. Overridable per-run via
 * `--stripe-concurrency=N` (CLI) or the `STRIPE_SUBACCOUNT_CONCURRENCY` env var.
 */
export const STRIPE_SUBACCOUNT_CONCURRENCY = 20;

/**
 * Minimum spacing between consecutive Stripe sub-account creations (ms). A small
 * sleep smooths the burst so the platform account's rate-limit bucket refills
 * between writes, on top of the concurrency cap above.
 */
export const STRIPE_SUBACCOUNT_CREATE_SPACING_MS = 10;

/**
 * Deterministic name prefix for the CACHED warm parent (`tw-warm-<refSha>`).
 * Keyed by the git ref's commit sha so it's reused across runs — and across
 * teammates on the same Vercel project — instead of rebuilt every run (plan §4a).
 */
export const WARM_SANDBOX_PREFIX = "tw-warm";

/**
 * The Autumn server port inside the µVM — the ONLY exposed port (declared in
 * `ports` at fork so `sandbox.domain(SERVER_PORT)` resolves). Plan §5/§10.
 */
export const SERVER_PORT = 8080;

/**
 * The port the Stripe Connect webhook INGRESS sandbox listens on. The ingress is
 * its OWN lightweight sandbox (it only runs a node http server, no µVM services),
 * so it can reuse the same base port as the worker server (8080). The orchestrator
 * exposes this port on the ingress sandbox and registers the ONE shared platform
 * Connect webhook at `<ingressPublicUrl>/ingress/connect/<env>` (plan §6a / §9a).
 */
export const INGRESS_PORT = SERVER_PORT;

/**
 * The ingress http server, relative to the repo root. It is a self-contained
 * `node:http` script with ZERO imports beyond node builtins — which is why the
 * Modal ingress sandbox uploads just this file instead of cloning the monorepo
 * (see `uploadIngressScript` in helpers/modal.ts). Keep it dependency-free.
 */
export const INGRESS_SCRIPT_RELATIVE = "scripts/tw/ingress/server.mjs";

/**
 * Vercel sandbox runtime. `node24` is the SDK default and what the swarm pins.
 * See plan §10 (`@vercel/sandbox` supports `node24`/`node22`/`node26`).
 */
export const VERCEL_RUNTIME = "node24";

/** Vercel region — `iad1` is the only supported region (plan §10). */
export const VERCEL_REGION = "iad1";

/**
 * vCPUs per worker (→ 2048 MB each, so 2 vCPU = 4 GB). Benchmarked fork→READY for
 * 50 workers: 4 vCPU = 200 total = exactly Vercel's 200 vCPU/min cap → forks
 * queue → all-READY 51s (tail to 51s). 2 vCPU = 100 total, well under the cap →
 * everything admits in the burst → all-READY ~30s (no tail), 0 boot failures on
 * 4 GB. The suite is I/O-bound (Stripe/DB), so 2 cores per worker is plenty.
 */
export const WORKER_VCPUS = 2;

/**
 * Default sandbox lifetime (workers AND the ingress). This is a hard max-runtime:
 * the provider TERMINATES the sandbox when it elapses, mid-test if need be, which
 * surfaces as worker death (reschedule storm) or — worse, because nothing fails
 * loudly — an ingress that silently stops forwarding Stripe webhooks.
 *
 * The old 10 minutes was sized against "the full suite is ~10min wall-clock",
 * which is no longer true and was never the right budget anyway: the clock starts
 * at CREATE, not at the first test. Measured on run msg4hbpw-jtlnwf: a worker
 * lived fan-out(32s) + run(519s) = 551s — 49s of headroom on a 600s ceiling — and
 * the INGRESS, created ~250s earlier (clone + webhook registration + pool claim +
 * fan-out), needed ~770s. A slightly slower run silently crosses both lines.
 *
 * 20 minutes gives ~2× headroom on today's numbers. The cost of a bigger number is
 * only how long a LEAKED sandbox lives before auto-expiry when teardown didn't run
 * (the Modal V2 orphan backstop) — recover sooner with `bun tw kill`.
 */
export const WORKER_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Vercel Sandbox PRO pricing (USD), for the post-run cost estimate. Rates are
 * per the Vercel pricing page (Pro tier). Storage is ephemeral over a minutes-long
 * run, so it's omitted as negligible. These translate the SDK's per-sandbox usage
 * getters (`totalActiveCpuDurationMs`, `totalDurationMs`, `total{Egress,Ingress}Bytes`,
 * `vcpus`, `memory`) into a dollar estimate — see `commands/run.ts` cost summary.
 */
export const VERCEL_SANDBOX_PRICING = {
	/** Active CPU, per active-CPU-hour. */
	activeCpuPerHour: 0.128,
	/** Provisioned memory, per GB-hour. */
	memoryPerGbHour: 0.0212,
	/** Data transfer (egress + ingress), per GB. */
	dataTransferPerGb: 0.15,
	/** Sandbox creations, per 1,000,000 creations. */
	creationsPerMillion: 0.6,
} as const;

/**
 * The env workers register Stripe webhooks + run tests under. The legacy webhook
 * route is `/webhooks/stripe/:orgId/:env`; `sandbox` is the env path segment
 * (plan §6a). `NODE_ENV` must NOT be `production` so skip-verify stays on.
 */
export const TW_ENV: TwEnv = "sandbox";

/**
 * Build the inbound Stripe webhook URL registered on a worker's sub-account.
 * The `orgId` in the path is load-bearing — the legacy seeder resolves the org
 * from the path, not from `event.account` (plan §6a gotcha c).
 */
export const buildWebhookPath = (orgId: string, env: TwEnv = TW_ENV): string =>
	`/webhooks/stripe/${orgId}/${env}`;

export const buildWebhookUrl = (
	publicUrl: string,
	orgId: string,
	env: TwEnv = TW_ENV,
): string => `${publicUrl}${buildWebhookPath(orgId, env)}`;

/**
 * Localhost service ports inside the µVM (plan §5a). dw's
 * `+(worktreeNum-1)*100` offsets are unnecessary because each worker is its own
 * µVM, so every worker uses the base ports.
 */
export const PG_PORT = 5432;
/** Dragonfly speaks the Redis protocol; one instance backs Redis + both caches. */
export const DRAGONFLY_PORT = 6379;
export const ELASTICMQ_PORT = 9324;
export const CLICKHOUSE_PORT = 8123;
/** dynoxide (native DynamoDB emulator — no JVM in the µVM; the Docker flows
 *  use amazon/dynamodb-local instead). Backs the idempotency-key store. */
export const DYNAMODB_PORT = 8000;

/**
 * Build-time localhost service URLs for a worker (plan §5a / §11a). All point at
 * the µVM's own daemons; `DATABASE_CRITICAL_URL` equals `DATABASE_URL`.
 */
/** Serves every edge config from memory (no S3 in the µVM) and pins the
 * v2-cache rollout to 100% — mirrors ADMIN_ROLLOUT_CONFIG_KEY on the server. */
export const EDGE_CONFIG_OVERRIDE_B64 = Buffer.from(
	JSON.stringify({
		"admin/rollout-config.json": {
			rollouts: {
				"v2-cache": {
					percent: 100,
					previousPercent: 100,
					changedAt: 0,
					orgs: {},
				},
			},
		},
	}),
).toString("base64");

export const DATABASE_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/autumn`;
export const DATABASE_CRITICAL_URL = DATABASE_URL;
export const REDIS_URL = `redis://localhost:${DRAGONFLY_PORT}`;
export const CACHE_URL = REDIS_URL;
export const CACHE_V2_DRAGONFLY_URL = REDIS_URL;
export const ELASTICMQ_BASE_URL = `http://localhost:${ELASTICMQ_PORT}/000000000000`;
export const SQS_QUEUE_URL_V2 = `${ELASTICMQ_BASE_URL}/autumn.fifo`;
export const TRACK_SQS_QUEUE_URL = `${ELASTICMQ_BASE_URL}/autumn-track.fifo`;
/** Aliased to the same queue as TRACK_SQS_QUEUE_URL (mirrors dw) — prod
 *  points this at a dedicated queue; unset it would 503 every async track. */
export const TRACK_ASYNC_SQS_QUEUE_URL = TRACK_SQS_QUEUE_URL;
export const DYNAMODB_ENDPOINT = `http://localhost:${DYNAMODB_PORT}`;
