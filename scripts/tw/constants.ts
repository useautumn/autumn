import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TwEnv } from "./types.ts";

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");

export const REGISTRY_DIR = join(homedir(), ".autumn-tw");
export const REGISTRY_FILE = join(REGISTRY_DIR, "registry.json");

export const SANDBOX_NAME_PREFIX = "tw";

export const WARM_LATEST_BRANCH = "dev";

export const DEFAULT_WORKERS = 400;

export const DEFAULT_PER_WORKER = 1;

export const STRIPE_SUBACCOUNT_CONCURRENCY = 20;

export const STRIPE_SUBACCOUNT_CREATE_SPACING_MS = 10;

export const WARM_SANDBOX_PREFIX = "tw-warm";

export const SERVER_PORT = 8080;

export const INGRESS_PORT = SERVER_PORT;

export const VERCEL_RUNTIME = "node24";

export const VERCEL_REGION = "iad1";

export const WORKER_VCPUS = 2;

export const WORKER_TIMEOUT_MS = 10 * 60 * 1000;

export const VERCEL_SANDBOX_PRICING = {
	activeCpuPerHour: 0.128,
	memoryPerGbHour: 0.0212,
	dataTransferPerGb: 0.15,
	creationsPerMillion: 0.6,
} as const;

export const TW_ENV: TwEnv = "sandbox";

export const buildWebhookPath = (orgId: string, env: TwEnv = TW_ENV): string =>
	`/webhooks/stripe/${orgId}/${env}`;

export const buildWebhookUrl = (
	publicUrl: string,
	orgId: string,
	env: TwEnv = TW_ENV,
): string => `${publicUrl}${buildWebhookPath(orgId, env)}`;

export const PG_PORT = 5432;
export const DRAGONFLY_PORT = 6379;
export const ELASTICMQ_PORT = 9324;
export const CLICKHOUSE_PORT = 8123;
export const DYNAMODB_PORT = 8000;
export const KAFKA_PORT = 19092;
export const KAFKA_BROKERS = `127.0.0.1:${KAFKA_PORT}`;
export const BALANCE_WORKER_PORT = 8082;
export const ATOM_PORT = 8086;
export const ATOM_PEER_PORT = 8087;
export const ATOM_URL = `http://127.0.0.1:${ATOM_PORT}`;

export const EDGE_CONFIG_OVERRIDE_B64 = Buffer.from(
	JSON.stringify({
		"admin/job-queue-config.json": {
			queues: { stripeWebhookReplay: { enabled: true } },
		},
		"admin/rollout-config.json": {
			rollouts: {
				"balance-worker": {
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
export const MISC_CACHE_DRAGONFLY_PUBLIC_URL = REDIS_URL;
export const CACHE_V2_DRAGONFLY_URL = REDIS_URL;
export const ELASTICMQ_BASE_URL = `http://localhost:${ELASTICMQ_PORT}/000000000000`;
export const STRIPE_WEBHOOK_SQS_QUEUE_URL = `${ELASTICMQ_BASE_URL}/autumn-stripe-webhook.fifo`;
export const SQS_QUEUE_URL_V2 = `${ELASTICMQ_BASE_URL}/autumn.fifo`;
export const TRACK_SQS_QUEUE_URL = `${ELASTICMQ_BASE_URL}/autumn-track.fifo`;
export const TRACK_ASYNC_SQS_QUEUE_URL = TRACK_SQS_QUEUE_URL;
export const TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = `${ELASTICMQ_BASE_URL}/autumn-track-async`;
export const DYNAMODB_ENDPOINT = `http://localhost:${DYNAMODB_PORT}`;
