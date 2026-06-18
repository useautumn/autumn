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

/** Pool size `N` default (`--max`). Sensible mid default per plan §3/§8.6. */
export const DEFAULT_WORKERS = 50;

/** Per-worker file concurrency `K` default (`--per-worker`). Plan §3/§8.6. */
export const DEFAULT_PER_WORKER = 1;

/**
 * The Autumn server port inside the µVM — the ONLY exposed port (declared in
 * `ports` at fork so `sandbox.domain(SERVER_PORT)` resolves). Plan §5/§10.
 */
export const SERVER_PORT = 8080;

/**
 * Vercel sandbox runtime. `node24` is the SDK default and what the swarm pins.
 * See plan §10 (`@vercel/sandbox` supports `node24`/`node22`/`node26`).
 */
export const VERCEL_RUNTIME = "node24";

/** Vercel region — `iad1` is the only supported region (plan §10). */
export const VERCEL_REGION = "iad1";

/** vCPUs per worker (→ 2048 MB memory per vCPU = 8 GB). Plan §5 sizing. */
export const WORKER_VCPUS = 4;

/** Default per-worker sandbox lifetime; the 5-min default is too short (plan §10). */
export const WORKER_TIMEOUT_MS = 45 * 60 * 1000;

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

/**
 * Build-time localhost service URLs for a worker (plan §5a / §11a). All point at
 * the µVM's own daemons; `DATABASE_CRITICAL_URL` equals `DATABASE_URL`.
 */
export const DATABASE_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/autumn`;
export const DATABASE_CRITICAL_URL = DATABASE_URL;
export const REDIS_URL = `redis://localhost:${DRAGONFLY_PORT}`;
export const CACHE_URL = REDIS_URL;
export const CACHE_V2_DRAGONFLY_URL = REDIS_URL;
export const ELASTICMQ_BASE_URL = `http://localhost:${ELASTICMQ_PORT}/000000000000`;
export const SQS_QUEUE_URL_V2 = `${ELASTICMQ_BASE_URL}/autumn.fifo`;
export const TRACK_SQS_QUEUE_URL = `${ELASTICMQ_BASE_URL}/autumn-track.fifo`;
