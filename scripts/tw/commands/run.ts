/**
 * `bun tw` orchestrator — the full run lifecycle (plan §9 + §9a).
 *
 * Phases:
 *   1. RESOLVE   — args → test files via the same `_groups` resolution `bun t`
 *                  uses (`resolveTestPaths` + recursive dir walk), then partition
 *                  svix vs normal files (helpers/svix.ts) and size the pool to
 *                  `min(workers, fileCount)` (plan §8.7).
 *   2. WARM-UP   — create the warm parent, run `image/warmup.sh <ref>` (checkout,
 *                  install, migrate — FAIL FAST — migrate-functions, seed with
 *                  Stripe disabled), `snapshotAndStop` → warm snapshot.
 *   3. FAN-OUT   — fork N workers from the warm snapshot. One dedicated svix shard
 *                  gets NEEDS_SVIX + SVIX_API_KEY. Per worker: getPublicUrl →
 *                  orchestrator createSandboxSubAccount + registerSubAccountWebhook
 *                  (RECORDED in the registry BEFORE the worker proceeds, §9a) →
 *                  detached `boot.ts` with ORG_ID + STRIPE_ACCOUNT_ID → wait READY.
 *   4. RUN       — build a WorkerPool + RemoteExecutor, route svix files only onto
 *                  the svix shard and normal files onto the rest, then hand off to
 *                  `runWithExecutor` (the unchanged sliding-window + retry + TUI).
 *   5. TEARDOWN  — idempotent, orchestrator-driven from the registry: per worker
 *                  deleteSubAccount + (svix) deleteSvixApp + deleteSandbox, then
 *                  markCompleted. `--keep` skips teardown.
 *
 * A SIGINT/SIGTERM guard installs the §9a Ctrl+C escape hatch: first signal →
 * stop scheduling + time-boxed teardown + markCancelled + exit 130; second
 * signal → force-exit (registry + tags persist for `bun tw kill`).
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deleteSvixApp as serverDeleteSvixApp } from "@server/external/svix/svixHelpers.js";
import {
	getGroup,
	resolveSuite,
	resolveTestPaths,
} from "@tests/_groups/index.ts";
import chalk from "chalk";
import pLimit from "p-limit";
import { TEST_ORG_CONFIG } from "../../setupTestUtils/createTestOrg.ts";
import {
	DATABASE_CRITICAL_URL,
	DATABASE_URL,
	DYNAMODB_ENDPOINT,
	EDGE_CONFIG_OVERRIDE_B64,
	KAFKA_BROKERS,
	PROJECT_ROOT,
	REDIS_URL,
	REGISTRY_DIR,
	SERVER_PORT,
	SQS_QUEUE_URL_V2,
	STRIPE_WEBHOOK_SQS_QUEUE_URL,
	TRACK_ASYNC_SQS_QUEUE_URL,
	TRACK_ASYNC_STANDARD_SQS_QUEUE_URL,
	TRACK_SQS_QUEUE_URL,
	TW_ENV,
	WARM_SANDBOX_PREFIX,
	WORKER_VCPUS,
} from "../constants.ts";
import {
	appendWorkerOutput,
	registerExpectedWorkers,
	resetHub,
	setWorkerStatus,
} from "../dashboard/hub.ts";
import {
	type DashboardServer,
	getDashboardSnapshot,
	startDashboardServer,
} from "../dashboard/server.ts";
import {
	formatBootSummary,
	recordBootOutput,
	resetBootTraces,
	startBootTrace,
	summarizeBootTraces,
} from "../helpers/bootTimings.ts";
import {
	type CostEstimate,
	estimateCost,
	formatCost,
	formatWall,
} from "../helpers/cost.ts";
import {
	type DurationStats,
	formatDurations,
	summarizeDurations,
} from "../helpers/durationStats.ts";
import {
	type CreateIngressResult,
	createIngress,
	pushWorkerMapping,
} from "../helpers/ingress.ts";
import { readInlineBunScript } from "../helpers/inlineBunScript.ts";
import { withGlobalLock } from "../helpers/lock.ts";
import {
	disableQuietMode,
	enableQuietMode,
	narrate,
	setLogFile,
	sink,
	sinkLine,
} from "../helpers/logSink.ts";
import { spawnDetachedNukeSandbox } from "../helpers/modal.ts";
import {
	getOwner,
	newRunId,
	sandboxName,
	vercelTags,
} from "../helpers/owner.ts";
import { planShardWorkers } from "../helpers/planShardWorkers.ts";
import { WorkerPool } from "../helpers/pool.ts";
import {
	createWarmSandbox,
	deleteSandbox,
	forkWorker,
	getPublicUrl,
	getSandboxByName,
	isSandboxStreamClosed,
	type ProviderSandbox,
	providerName,
	runDetached,
	runStreaming,
	sandboxRepoRoot,
	setProvider,
	snapshotAndStop,
} from "../helpers/provider.ts";
import * as registry from "../helpers/registry.ts";
import { RemoteExecutor } from "../helpers/remoteExecutor.ts";
import {
	elapsedMs,
	formatSetupTimeline,
	getSetupTimeline,
	markPhase,
	resetSetupTimeline,
	timePhase,
} from "../helpers/setupTimeline.ts";
import {
	createSandboxSubAccount,
	deleteConnectWebhook,
	deleteSubAccount,
	registerConnectIngressWebhook,
	validateStripeKeyPool,
} from "../helpers/stripe.ts";
import { stripeBudgetForRun } from "../helpers/stripeBudget.ts";
import {
	allPoolKeys,
	decodeSubAccount,
	encodeSubAccount,
	keyIndexFromWebhookTag,
	stripeKeyByIndex,
	stripeKeyForWorker,
	stripeKeyPoolSize,
	webhookKeyTag,
} from "../helpers/stripeKeyPool.ts";
import { claimPoolAccounts } from "../helpers/stripePool.ts";
import {
	createSvixApp as orchestratorCreateSvixApp,
	partitionShards,
} from "../helpers/svix.ts";
import { createTestFileResolver } from "../testDiscovery/createTestFileResolver";
import { runShardTests } from "../tui/runShardTests.ts";
import {
	bumpAccountDone,
	bumpSandboxDone,
	bumpStripeDone,
	bumpWorkerFailed,
	bumpWorkerReady,
	getTuiState,
	resetTui,
	setDashboardUrl,
	setFanoutTotals,
	setPhase,
	setRunMeta,
	setSummary,
	setTeardownAccounts,
	setTeardownSandboxes,
	setWarmHit,
} from "../tui/store.ts";
import type { TwRunArgs, WorkerHandle } from "../types.ts";
import { READY_SENTINEL } from "../worker/boot.ts";
import { BALANCE_SYNC_SQS_QUEUE_URL } from "../worker/prepareBalanceSyncQueue.js";

/**
 * The repo root INSIDE the µVM. Vercel Sandbox sessions default their cwd to
 * `/vercel/sandbox`, where the base snapshot's repo checkout lives; the image
 * scripts (`warmup.sh`, `start-services.sh`) resolve their own root relative to
 * their location, but `boot.ts` reads `process.cwd()`, so detached boot must run
 * from here. Provider-aware (`/vercel/sandbox` vs Modal's `/repo`); overridable
 * via `TW_SANDBOX_REPO_ROOT` for local iteration. See `sandboxRepoRoot()`.
 */

/** Path to the warm-up image script, relative to the in-sandbox repo root. */
const BUILD_BASE_SCRIPT = "scripts/tw/image/build-base.sh";
const WARMUP_SCRIPT = "scripts/tw/image/warmup.sh";

/**
 * Git source for the warm parent's clone (repo @ ref): the
 * origin URL (or `TW_GIT_URL`), normalized to https; private repos use
 * `GITHUB_TOKEN`. Vercel clones this `revision` into the warm sandbox so
 * `build-base.sh` / `warmup.sh` have the repo to operate on.
 */
export const resolveGitSource = (
	ref: string,
): { url: string; revision: string; username?: string; password?: string } => {
	const git = (...a: string[]): string =>
		new TextDecoder()
			.decode(
				Bun.spawnSync(["git", ...a], { stdout: "pipe", stderr: "pipe" }).stdout,
			)
			.trim();
	let url =
		process.env.TW_GIT_URL || git("config", "--get", "remote.origin.url");
	if (url.startsWith("git@github.com:")) {
		url = `https://github.com/${url.slice("git@github.com:".length)}`;
	}
	url = `${url.replace(/\.git$/, "")}.git`;
	// The repo is PUBLIC → clone anonymously (no token in the URL, so nothing lands
	// in the Modal image build history). A token is opt-in ONLY via `TW_GIT_TOKEN`
	// (for a private fork); we deliberately do NOT auto-pull GITHUB_TOKEN here.
	const token = process.env.TW_GIT_TOKEN;
	return token
		? { url, revision: ref, username: "x-access-token", password: token }
		: { url, revision: ref };
};
/** Path to the per-worker boot script, relative to the in-sandbox repo root. */
const BOOT_SCRIPT = "scripts/tw/worker/boot.ts";

/** Default owner email stamped on Stripe sub-accounts (contact_email). */
const OWNER_EMAIL_FALLBACK = "tw@autumn.test";

/** How long a single resource's teardown may take before we give up on it (§9a). */
const TEARDOWN_PER_RESOURCE_TIMEOUT_MS = 20_000;

/** Bounded concurrency for teardown deletes (serial was the long-pole at N=62). */
const TEARDOWN_STRIPE_CONCURRENCY = 16;
const TEARDOWN_SANDBOX_CONCURRENCY = 16;

/**
 * Demand-tracked culling. During the RUN phase, idle workers beyond a buffer are
 * terminated early so we stop paying for ~N idle sandboxes while a few stragglers
 * finish. The buffer is a FRACTION of the initial pool (default 30%) kept idle as
 * retry/worker-death headroom; busy workers are never culled and the pool never
 * drops below the buffer. Tune `TW_CULL_BUFFER_FRACTION`; disable with `TW_DISABLE_CULL=1`.
 */
const CULL_IDLE_BUFFER_FRACTION = Number(
	process.env.TW_CULL_BUFFER_FRACTION ?? 0.3,
);
const CULL_INTERVAL_MS = 2000;
const CULL_DISABLED = process.env.TW_DISABLE_CULL === "1";

/**
 * Demand-tracked cull loop for a worker pool. Keeps `CULL_IDLE_BUFFER_FRACTION` of
 * the INITIAL pool size as idle retry/death headroom + every busy worker, and
 * terminates idle workers beyond that every {@link CULL_INTERVAL_MS}. The pool's
 * `cullIdle` only ever removes idle workers and never drops below the buffer, so
 * retries always have spare capacity. Returns a stop function; no-op if disabled.
 */
const startCulling = (
	pool: WorkerPool,
	resolveSandbox: (worker: WorkerHandle) => ProviderSandbox | undefined,
): (() => void) => {
	if (CULL_DISABLED) {
		return () => {
			/* culling disabled */
		};
	}
	const bufferCount = Math.max(
		1,
		Math.ceil(pool.size * CULL_IDLE_BUFFER_FRACTION),
	);
	let culledTotal = 0;
	const timer = setInterval(() => {
		const excess = pool.idleCount - bufferCount;
		if (excess <= 0) {
			return;
		}
		const culled = pool.cullIdle(excess, bufferCount);
		for (const worker of culled) {
			setWorkerStatus(worker.name, "dead");
			const sandbox = resolveSandbox(worker);
			if (sandbox) {
				void deleteSandbox(sandbox).catch(() => {
					/* best-effort — the final teardown is idempotent */
				});
			}
		}
		if (culled.length > 0) {
			culledTotal += culled.length;
			milestone(
				`cull: freed ${culled.length} idle worker(s) → pool ${pool.size} (keeping ${bufferCount} idle buffer; ${culledTotal} culled total)`,
			);
		}
	}, CULL_INTERVAL_MS);
	return () => clearInterval(timer);
};

/** How long to wait for a worker to print the READY sentinel after boot starts. */
const WORKER_READY_TIMEOUT_MS = 5 * 60 * 1000;

const SIGINT_EXIT_CODE = 130;

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const elapsedTag = (): string => `+${(elapsedMs() / 1000).toFixed(1)}s`;

const log = (message: string): void => {
	sinkLine(chalk.cyan(`[tw] ${elapsedTag()} ${message}`));
};

/**
 * Phase-boundary milestone — ALWAYS visible on the terminal (via `narrate`),
 * even during quiet mode when the firehose is routed to the run log + web
 * dashboard. Keeps the terminal from sitting silent for minutes during warm-up /
 * snapshot / fan-out. Use sparingly: lifecycle transitions, not the firehose.
 */
const milestone = (message: string): void => {
	narrate(chalk.cyan.bold(`[tw] ${elapsedTag()} ${message}`));
};

const warn = (message: string): void => {
	sinkLine(chalk.yellow(`[tw] ${elapsedTag()} ${message}`));
};

const errorLog = (message: string): void => {
	sinkLine(chalk.red(`[tw] ${elapsedTag()} ${message}`));
};

/** Copy text to the OS clipboard (best-effort, platform-aware). */
const copyToClipboard = (text: string): void => {
	const argv =
		process.platform === "darwin"
			? ["pbcopy"]
			: process.platform === "win32"
				? ["clip"]
				: ["xclip", "-selection", "clipboard"];
	try {
		const proc = Bun.spawn(argv, {
			stdin: "pipe",
			stdout: "ignore",
			stderr: "ignore",
		});
		proc.stdin.write(text);
		proc.stdin.end();
	} catch {
		// best-effort
	}
};

/**
 * Build the dashboard SPA (apps/testbench) once so the WS server can serve it
 * same-origin → one-click open. Rebuilds whenever any dashboard source is newer
 * than the built bundle — a stale dist once hid five chart fixes from the user.
 */
const ensureDashboardSpa = (): void => {
	const dir = join(PROJECT_ROOT, "apps", "testbench");
	const builtAt = (() => {
		try {
			return statSync(join(dir, "dist", "index.html")).mtimeMs;
		} catch {
			return 0;
		}
	})();
	const newestSourceMtime = (root: string): number => {
		let newest = 0;
		try {
			for (const entry of readdirSync(root, {
				recursive: true,
				withFileTypes: true,
			})) {
				if (!entry.isFile()) {
					continue;
				}
				const mtime = statSync(
					join(entry.parentPath ?? root, entry.name),
				).mtimeMs;
				if (mtime > newest) {
					newest = mtime;
				}
			}
		} catch {
			/* missing dir — treat as no sources */
		}
		return newest;
	};
	const sourcesAt = Math.max(
		newestSourceMtime(join(dir, "src")),
		newestSourceMtime(join(PROJECT_ROOT, "packages", "ui", "src")),
		(() => {
			try {
				return statSync(join(dir, "index.html")).mtimeMs;
			} catch {
				return 0;
			}
		})(),
	);
	if (builtAt > 0 && builtAt >= sourcesAt) {
		return;
	}
	process.stdout.write(
		builtAt === 0
			? "📊 building dashboard (first run)…\n"
			: "📊 dashboard sources changed — rebuilding…\n",
	);
	Bun.spawnSync(["bun", "run", "build"], {
		cwd: dir,
		stdout: "ignore",
		stderr: "ignore",
	});
};

/** Open a URL in the default browser (best-effort, platform-aware). */
const openInBrowser = (url: string): void => {
	const argv =
		process.platform === "darwin"
			? ["open", url]
			: process.platform === "win32"
				? ["cmd", "/c", "start", "", url]
				: ["xdg-open", url];
	try {
		Bun.spawn(argv, { stdout: "ignore", stderr: "ignore" });
	} catch {
		// best-effort
	}
};

// Detached sandbox log streams (worker boot, ingress) reject with a
// `sandbox_stream_closed` StreamError when teardown deletes the sandbox out from
// under a still-iterating `cmd.logs()` reader — benign end-of-stream, but it
// surfaces as an UNHANDLED rejection (the iterator isn't inside a try/catch).
// Swallow exactly those; re-surface anything else so real bugs still show.
process.on("unhandledRejection", (reason) => {
	if (isSandboxStreamClosed(reason)) {
		return;
	}
	errorLog(
		`unhandled rejection: ${
			reason instanceof Error
				? (reason.stack ?? reason.message)
				: String(reason)
		}`,
	);
});

/** Run a best-effort, time-boxed async action; never throws (teardown safety). */
const timeBoxed = async (
	label: string,
	action: () => Promise<void>,
	timeoutMs: number = TEARDOWN_PER_RESOURCE_TIMEOUT_MS,
): Promise<void> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<void>((resolve) => {
		timer = setTimeout(() => {
			warn(`${label} timed out after ${timeoutMs}ms — moving on`);
			resolve();
		}, timeoutMs);
	});
	try {
		await Promise.race([action(), timeout]);
	} catch (error) {
		warn(`${label} failed: ${(error as Error).message}`);
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
	}
};

// ============================================================================
// Phase 1 — resolve test files (reuse `bun t`'s `_groups` resolution)
// ============================================================================

const TESTS_DIR = join(PROJECT_ROOT, "server", "tests");

/**
 * Resolve the positional args (group/suite names, or `server/tests`-relative
 * paths) to a de-duplicated, sorted list of absolute test files — the SAME
 * `_groups` resolution `bun t` uses (`resolveTestPaths`/`getGroup`/`resolveSuite`
 * from `server/tests/_groups`, plus the dispatcher's dir walk). Falls back to the
 * whole `core` suite when no args are given.
 */
const resolveTestFiles = async (
	groupsOrPatterns: string[],
): Promise<string[]> => {
	const args = groupsOrPatterns.length > 0 ? groupsOrPatterns : ["core"];
	const files = new Set<string>();
	const resolver = await createTestFileResolver({ rootDir: TESTS_DIR });

	for (const arg of args) {
		const groupPaths = resolveTestPaths({ name: arg });
		if (groupPaths) {
			const matchedGroup = getGroup({ name: arg });
			const suiteGroups = resolveSuite({ name: arg });
			const label = matchedGroup ? "group" : suiteGroups ? "suite" : "paths";
			log(`matched ${label} "${arg}" (${groupPaths.length} path(s))`);
			for (const groupPath of groupPaths) {
				for (const file of resolver.resolvePath({ path: groupPath })) {
					files.add(file);
				}
			}
			continue;
		}

		// Not a known group/suite — treat the arg itself as a server/tests path.
		const resolved = resolver.resolvePath({ path: arg });
		if (resolved.length === 0) {
			warn(`no test files matched "${arg}"`);
		}
		for (const file of resolved) {
			files.add(file);
		}
	}

	return [...files].sort();
};

// ============================================================================
// Phase 2 — warm-up
// ============================================================================

type WarmUpResult = {
	warmSnapshotId: string;
};

/** Secrets resolved once on the orchestrator and baked into every worker (§11a). */
const requireSecret = (name: string): string => {
	const value = process.env[name];
	if (!value) {
		throw new Error(
			`[tw] missing required secret ${name} in the orchestrator env (resolve via Infisical / .env before \`bun tw\`)`,
		);
	}
	return value;
};

/**
 * Build the env baked into a worker fork (plan §11a). The localhost service URLs
 * are constants; the encryption/auth secrets + the Stripe platform key are
 * resolved once on the orchestrator and injected. `SVIX_API_KEY` / `NEEDS_SVIX`
 * are added only for the dedicated svix shard.
 */
/** Resolved commit sha for this run (set in run()); workers fast-forward to it. */
let resolvedTargetSha = "";

let stripeBudget = stripeBudgetForRun({
	workers: 1,
	keys: stripeKeyPoolSize(),
});
/** Whether the run's servers route to the balance worker; set from `--balance-worker` before fan-out. */
let balanceWorkerEnabled = true;

const buildWorkerEnv = ({
	stripeAccountId,
	stripeSecretKey,
	isSvixShard,
	svixAppId,
	ingressUrl,
	ingressToken,
}: {
	stripeAccountId: string;
	/** This worker's pool key — MUST match the key its sub-account was created on. */
	stripeSecretKey: string;
	isSvixShard: boolean;
	svixAppId?: string;
	ingressUrl: string;
	ingressToken: string;
}): Record<string, string> => {
	const env: Record<string, string> = {
		NODE_ENV: "development",
		SERVER_PORT: String(SERVER_PORT),
		// localhost service URLs (the µVM's own daemons).
		DATABASE_URL,
		DATABASE_CRITICAL_URL,
		AUTUMN_API_URL: `http://localhost:${SERVER_PORT}`,
		AUTUMN_PUBLIC_API_URL: `http://localhost:${SERVER_PORT}`,
		REDIS_URL,
		MISC_CACHE_DRAGONFLY_PUBLIC_URL: REDIS_URL,
		CACHE_V2_DRAGONFLY_URL: REDIS_URL,
		BALANCE_SYNC_SQS_QUEUE_URL,
		SQS_QUEUE_URL_V2,
		STRIPE_WEBHOOK_SQS_QUEUE_URL,
		TRACK_SQS_QUEUE_URL,
		TRACK_ASYNC_SQS_QUEUE_URL,
		TRACK_ASYNC_STANDARD_SQS_QUEUE_URL,
		DYNAMODB_ENDPOINT,
		// fakecloud never evaluates the role; the Scheduler just requires a well-formed ARN.
		AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN:
			"arn:aws:iam::000000000000:role/fakecloud-scheduler",
		// The µVM's own Redpanda and balance worker (started by boot.ts); the
		// `local` deployment names the topics warmup.sh created.
		KAFKA_BROKERS,
		KAFKA_AUTH_MODE: "none",
		BALANCE_WORKER_DEPLOYMENT: "local",
		BALANCE_WORKER_ROLLOUT_ENABLED: String(balanceWorkerEnabled),
		// baked secrets (every worker).
		ENCRYPTION_IV: requireSecret("ENCRYPTION_IV"),
		ENCRYPTION_PASSWORD: requireSecret("ENCRYPTION_PASSWORD"),
		BETTER_AUTH_SECRET: requireSecret("BETTER_AUTH_SECRET"),
		STRIPE_WEBHOOK_SKIP_VERIFY: "true",
		// per-worker Stripe (this worker's POOL key + the sub-account it binds; the
		// account was created on this same key, so they share one rate-limit bucket).
		STRIPE_SANDBOX_SECRET_KEY: stripeSecretKey,
		// The connect seeder calls getStripeWebhookSecret UNCONDITIONALLY (before the
		// skip-verify branch) and throws if it's unset; the ingress forwards without an
		// org_id query, so it falls to this env var. Skip-verify never uses the value,
		// so a dummy satisfies it (plan §6a) — otherwise the worker 500s every webhook.
		STRIPE_SANDBOX_WEBHOOK_SECRET: "whsec_tw_skipverify",
		STRIPE_ACCOUNT_ID: stripeAccountId,
		TW_STRIPE_INGRESS_URL: ingressUrl,
		TW_STRIPE_INGRESS_TOKEN: ingressToken,
		ORG_ID: TEST_ORG_CONFIG.id,
		// The exact commit under test — freestyle workers fast-forward to it at
		// boot (inert on other providers).
		TW_TARGET_SHA: resolvedTargetSha,
		// The bun-test preload (server/tests/setup-integration-tests.ts) only builds
		// the default TestContext when TESTS_ORG is set, and createTestContext reads
		// it as the org SLUG (OrgService.getBySlug). Without it EVERY integration test
		// fails with "Default TestContext is not initialized". The org secret key
		// (UNIT_TEST_AUTUMN_SECRET_KEY) is baked into server/.env.local by the warm
		// seed and loaded by the preload, so only TESTS_ORG + the base URL are needed.
		TESTS_ORG: TEST_ORG_CONFIG.slug,
		AUTUMN_TEST_BASE_URL: `http://localhost:${SERVER_PORT}`,
		// keep the DB CLI / preload paths off Infisical inside the µVM.
		AUTUMN_DB_DIRECT: "1",
		// Workers have no trigger.dev key: migrations run inline in-process
		// (shouldRunMigrationInline) instead of via the durable layer.
		TW_WORKER_MODE: "1",
		// Reused Stripe accounts retain idempotency responses from earlier cloned databases.
		TW_STRIPE_IDEMPOTENCY_NAMESPACE: crypto.randomUUID(),
		// All processes share the same allocation through this worker's Redis.
		TW_STRIPE_REDIS_URL: REDIS_URL,
		TW_STRIPE_MAX_RPS: String(stripeBudget.maxRps),
		TW_STRIPE_MAX_INFLIGHT: String(stripeBudget.maxInFlight),
		...(process.env.TW_STRIPE_TRACE === "1" ? { TW_STRIPE_TRACE: "1" } : {}),
		// The µVM is isolated and has NO AWS creds, so the S3-backed edge configs
		// (rollout, cache-v2-ramp, redis-v2-cache, blue-green, …) can't be read —
		// they'd poll S3 every 1s and spam CredentialsProviderError, AND the
		// v2-cache rollout would resolve EMPTY, silently dropping the server to the
		// legacy non-atomic cache-v1 path (breaking concurrency assertions + 202s).
		// The base64 edge-config override makes every store serve from memory (no
		// S3) and forces the v2-cache rollout to 100% — the prod default for months.
		AUTUMN_EDGE_CONFIG_OVERRIDE_B64: EDGE_CONFIG_OVERRIDE_B64,
	};

	// Shared dev Tinybird (no in-µVM instance — gVisor blocks it). Flows per-run
	// like the other secrets, never baked into the warm image/snapshot.
	if (
		process.env.TINYBIRD_US_EAST_API_URL &&
		process.env.TINYBIRD_US_EAST_TOKEN
	) {
		env.TINYBIRD_US_EAST_API_URL = process.env.TINYBIRD_US_EAST_API_URL;
		env.TINYBIRD_US_EAST_TOKEN = process.env.TINYBIRD_US_EAST_TOKEN;
		// Raw ClickHouse endpoint — the pipes API can't serve single-event reads,
		// so analytics tests that assert an exact event need this too.
		if (process.env.TINYBIRD_US_EAST_CLICKHOUSE_URL) {
			env.TINYBIRD_US_EAST_CLICKHOUSE_URL =
				process.env.TINYBIRD_US_EAST_CLICKHOUSE_URL;
		}
	}

	// Browser tests (Stripe checkout / setup-payment) use the LOCAL Playwright
	// Chromium baked into the image (build-base §9). `USE_KERNEL_BROWSER` stays
	// UNSET so browserConfig.ts takes the local `chromium.launch()` path (verified
	// launching v148 in-µVM). Kernel cloud browsers were crashing every checkout
	// ("[kernelExecute] … Target crashed"). Opt back into Kernel — e.g. to debug a
	// browser-specific issue — with TW_USE_KERNEL=1 + KERNEL_API_KEY.
	if (process.env.TW_USE_KERNEL && process.env.KERNEL_API_KEY) {
		env.USE_KERNEL_BROWSER = "1";
		env.KERNEL_API_KEY = process.env.KERNEL_API_KEY;
	}

	if (isSvixShard) {
		env.NEEDS_SVIX = "1";
		env.SVIX_API_KEY = requireSecret("SVIX_API_KEY");
		// The orchestrator already created + recorded the Svix app (§9a); the worker
		// only BINDS this id into svix_config (it no longer creates the app itself).
		if (!svixAppId) {
			throw new Error(
				"[tw] svix shard worker requires the orchestrator-created SVIX_APP_ID",
			);
		}
		env.SVIX_APP_ID = svixAppId;
	}

	return env;
};

/**
 * The warm-up env baked into the warm parent for `warmup.sh` (it `cd`s into the
 * repo and only needs the localhost DB + worker-mode flag; the script sets the
 * rest itself). Mirrors the warmup.sh defaults so the seed runs Stripe-disabled.
 */
const buildWarmEnv = (): Record<string, string> => ({
	NODE_ENV: "development",
	DATABASE_URL,
	DATABASE_CRITICAL_URL,
	REDIS_URL,
	MISC_CACHE_DRAGONFLY_PUBLIC_URL: REDIS_URL,
	CACHE_V2_DRAGONFLY_URL: REDIS_URL,
	BALANCE_SYNC_SQS_QUEUE_URL,
	SQS_QUEUE_URL_V2,
	STRIPE_WEBHOOK_SQS_QUEUE_URL,
	TRACK_SQS_QUEUE_URL,
	TRACK_ASYNC_SQS_QUEUE_URL,
	TRACK_ASYNC_STANDARD_SQS_QUEUE_URL,
	DYNAMODB_ENDPOINT,
	KAFKA_BROKERS,
	KAFKA_AUTH_MODE: "none",
	BALANCE_WORKER_DEPLOYMENT: "local",
	AUTUMN_DB_DIRECT: "1",
	TW_WORKER_MODE: "1",
	TW_SKIP_STRIPE_ACCOUNT: "1",
	ENCRYPTION_IV: requireSecret("ENCRYPTION_IV"),
	ENCRYPTION_PASSWORD: requireSecret("ENCRYPTION_PASSWORD"),
	BETTER_AUTH_SECRET: requireSecret("BETTER_AUTH_SECRET"),
	AUTUMN_API_URL: `http://localhost:${SERVER_PORT}`,
	AUTUMN_PUBLIC_API_URL: `http://localhost:${SERVER_PORT}`,
});

/**
 * Resolve the commit sha the warm parent is keyed/cached on. Vercel clones
 * `origin/<ref>` at create, so key on what origin resolves to NOW; fall back to a
 * local rev-parse, then the ref string itself.
 */
const resolveRefSha = (ref: string): string => {
	const git = (...a: string[]): string =>
		new TextDecoder()
			.decode(
				Bun.spawnSync(["git", ...a], { stdout: "pipe", stderr: "pipe" }).stdout,
			)
			.trim();
	const remote = git("ls-remote", "origin", ref).split(/\s+/)[0] ?? "";
	if (/^[0-9a-f]{40}$/.test(remote)) {
		return remote;
	}
	const local = git("rev-parse", ref);
	return /^[0-9a-f]{40}$/.test(local) ? local : ref;
};

/**
 * Get the CACHED warm parent for this ref-sha, or build it. The warm parent is
 * named deterministically (`tw-warm-<sha>`), so a prior run — or a teammate on
 * the same Vercel project — that already built this exact ref is reused: build-base
 * + warmup are skipped and workers fork straight from it (plan §4a).
 *
 * It is intentionally NOT registered for teardown — it's a persistent per-ref
 * cache. (Pruning old warm parents is a follow-up `kill --warm-gc`.) Returns the
 * warm parent's name (the fork source for every worker).
 */
const getOrBuildWarmParent = async ({
	ref,
	sha,
	signal,
}: {
	ref: string;
	sha: string;
	signal: AbortSignal;
}): Promise<string> => {
	const warmName = `${WARM_SANDBOX_PREFIX}-${sha.slice(0, 12)}`;

	const cached = await getSandboxByName(warmName);
	if (cached) {
		// Collapse the dashboard's warm stepper — there is no pipeline to show.
		setWarmHit(cached.warmHit ?? "exact");
		log(
			`warm-up: reusing cached warm parent ${warmName} (ref ${ref} @ ${sha.slice(0, 7)}) — skipping build`,
		);
		return warmName;
	}

	milestone(
		`warm-up: building warm parent ${warmName} (ref=${ref} @ ${sha.slice(0, 7)})`,
	);
	const warm = await createWarmSandbox({
		name: warmName,
		tags: { kind: "bun-tw-warm", sha: sha.slice(0, 12) },
		env: buildWarmEnv(),
		source: { ...resolveGitSource(ref), revision: sha },
		signal,
	});

	// FAIL FAST: on any build failure delete the half-built warm parent so a
	// broken cache entry isn't reused next run, and no workers are forked (the
	// "don't get wrecked ×1000" property, plan §4b step 3).
	const failBuild = async (message: string): Promise<never> => {
		// Surface the failure on the terminal (quiet mode routes errorLog to the file
		// only) so a warm-up abort isn't invisible behind the dashboard.
		milestone(`✗ ${message}`);
		await timeBoxed(`delete warm parent ${warmName}`, () =>
			deleteSandbox(warm),
		);
		throw new Error(message);
	};

	// build-base.sh installs the services (PG18 / Dragonfly / goaws / bun) on the
	// Vercel µVM (Amazon Linux 2023, dnf). On Modal those are baked into the
	// published base image (helpers/modalImage.ts) — the dnf script can't run on
	// Debian — so this step is skipped and the repo is cloned by createWarmSandbox.
	if (providerName() === "vercel") {
		log("warm-up: running build-base.sh (PG18, Dragonfly, goaws, bun)");
		const baseRun = await runStreaming(
			warm,
			["bash", BUILD_BASE_SCRIPT],
			(text) => sink(text),
			{ signal, swallowStreamClose: true },
		);
		if (baseRun.exitCode !== 0) {
			await failBuild(
				`warm-up failed (build-base.sh exited ${baseRun.exitCode}) — aborting, no workers forked`,
			);
		}
	} else {
		log(
			"warm-up: services baked into the Modal base image (build-base skipped)",
		);
	}

	milestone(
		"warm-up: running warmup.sh (checkout → install → migrate → seed) — streaming to the run log",
	);
	const warmRun = await runStreaming(
		warm,
		["bash", WARMUP_SCRIPT, sha],
		(text) => sink(text),
		{ signal, swallowStreamClose: true },
	);
	if (warmRun.exitCode !== 0) {
		await failBuild(
			`warm-up failed (warmup.sh exited ${warmRun.exitCode}) — aborting, no workers forked`,
		);
	}

	milestone("warm-up: snapshotting warm parent (cached for this ref)");
	try {
		await snapshotAndStop(warm, { signal });
	} catch (error) {
		await failBuild(
			`warm-up failed (snapshot: ${(error as Error).message}) — aborting, no workers forked`,
		);
	}
	milestone(`warm-up: warm parent ${warmName} ready`);
	return warmName;
};

// ============================================================================
// Phase 3 — fan-out + per-worker boot
// ============================================================================

type ProvisionedWorker = {
	handle: WorkerHandle;
	sandbox: ProviderSandbox;
	/** Timings (ms since fan-out start) for benchmarking the provisioning phase. */
	timing: {
		/** When this worker's Stripe sub-account was available (claimed/created). */
		stripeMs: number;
		/** When the `create`/fork call returned (sandbox object in hand). */
		createMs: number;
		/** Part of the fork call spent fast-forwarding the source (stale warm). */
		checkoutMs: number;
		/** When `getPublicUrl`/`tunnels()` resolved — i.e. the sandbox is actually
		 * RUNNING (this is where snapshot-restore/start wait shows up). */
		tunnelMs: number;
		/** When this worker reached READY (boot + server health). */
		readyMs: number;
	};
};

/**
 * Wait for a worker's detached boot command to print the READY sentinel,
 * streaming its boot output to stdout. Resolves once READY is seen; rejects if
 * the boot command exits first (boot failed) or the timeout elapses.
 */
const waitForReady = async ({
	sandbox,
	name,
	signal,
}: {
	sandbox: ProviderSandbox;
	name: string;
	signal: AbortSignal;
}): Promise<void> => {
	setWorkerStatus(name, "booting");
	let ready = false;
	let resolveReady: () => void = () => {
		// replaced below
	};
	const readyPromise = new Promise<void>((resolve) => {
		resolveReady = resolve;
	});

	// Forward the worker's BOOT output through the log sink ONLY until READY.
	// Before READY the orchestrator has no TUI (the sink writes to stdout, useful
	// boot progress); once the run phase mounts Ink the sink is quiet (the lines
	// go to the run log file). After READY we stop forwarding entirely — the
	// worker's per-request server logs (incl. noisy `[Redis] Connection error`
	// retries × 50 workers) are pure noise during the run.
	const onBootChunk = (text: string): void => {
		recordBootOutput({ worker: name, text });
		// Dashboard: capture the worker's server output for its WHOLE life (the
		// per-worker view shows this); no-op unless the dashboard is enabled.
		appendWorkerOutput(name, text);
		if (!ready) {
			sinkLine(chalk.gray(`[${name}] ${text.replace(/\n$/, "")}`));
			if (text.includes(READY_SENTINEL)) {
				ready = true;
				resolveReady();
				setWorkerStatus(name, "ready");
			}
		}
	};

	// Detached: the boot command (services + the long-lived server) must keep
	// running for the whole test run, so we don't await its completion here.
	startBootTrace(name);
	const command = await runDetached(sandbox, ["bun", BOOT_SCRIPT], {
		cwd: sandboxRepoRoot(),
		onChunk: onBootChunk,
		signal,
	});

	const exitedFirst = command
		.wait({ signal })
		.then((finished) => {
			if (!ready) {
				throw new Error(
					`worker ${name} boot exited (code ${finished.exitCode}) before READY`,
				);
			}
		})
		.catch((error: unknown) => {
			// Once READY, the detached boot keeps streaming for the whole run; when
			// teardown deletes the sandbox the log stream closes and `wait()` rejects
			// with a benign `sandbox_stream_closed` StreamError. Swallow it so it
			// can't surface as an uncaught rejection spamming the console — but only
			// after READY (a pre-READY stream close is a real boot failure).
			if (ready && isSandboxStreamClosed(error)) {
				return;
			}
			throw error;
		});

	const deadline = sleep(WORKER_READY_TIMEOUT_MS).then(() => {
		if (!ready) {
			throw new Error(
				`worker ${name} did not signal READY within ${WORKER_READY_TIMEOUT_MS}ms`,
			);
		}
	});

	await Promise.race([readyPromise, exitedFirst, deadline]);
};

/** A worker's pre-claimed pool account, or a fresh one RECORDED before it is returned
 * so a fork/boot failure can never orphan an untracked Stripe account (§9a). */
const resolveWorkerAccount = async ({
	idx,
	name,
	runId,
	owner,
	ownerEmail,
	pooledAccounts,
}: {
	idx: number;
	name: string;
	runId: string;
	owner: string;
	ownerEmail: string;
	pooledAccounts: Promise<string[] | undefined>;
}): Promise<string> => {
	const pooledAccount = (await pooledAccounts)?.[idx];
	if (pooledAccount) {
		return decodeSubAccount(pooledAccount).accountId;
	}
	const { key: stripeSecretKey, keyIndex } = stripeKeyForWorker(idx);
	const accountId = await createSandboxSubAccount({
		orgName: `${TEST_ORG_CONFIG.name} (${name})`,
		ownerEmail,
		owner,
		runId,
		orgId: TEST_ORG_CONFIG.id,
		secretKey: stripeSecretKey,
	});
	await registry.addSubAccount(runId, encodeSubAccount(accountId, keyIndex));
	return accountId;
};

/**
 * Provision one worker: take its Stripe sub-account, fork from the warm snapshot,
 * run the detached boot, wait READY, and push the `{ accountId → workerUrl }`
 * mapping to the shared ingress so the one Connect webhook routes its events here.
 */
const provisionWorker = async ({
	idx,
	owner,
	runId,
	warmName,
	isSvixShard,
	ownerEmail,
	pooledAccounts,
	ingress,
	fanoutStart,
	signal,
}: {
	idx: number;
	owner: string;
	runId: string;
	warmName: string;
	isSvixShard: boolean;
	ownerEmail: string;
	/** The run's pool claim (encoded `acct_*::keyIndex` per worker idx), if pooled. */
	pooledAccounts: Promise<string[] | undefined>;
	ingress: Promise<CreateIngressResult>;
	/** Epoch ms when the fan-out phase began, for per-worker provisioning timings. */
	fanoutStart: number;
	signal: AbortSignal;
}): Promise<ProvisionedWorker> => {
	const name = sandboxName(owner, runId, idx);
	const orgId = TEST_ORG_CONFIG.id;
	// This worker's Stripe pool key (round-robin). The sub-account is CREATED on
	// this key and the worker's server USES this key, so they share one platform
	// rate-limit bucket — sharding workers across keys multiplies the ceiling.
	const { key: stripeSecretKey } = stripeKeyForWorker(idx);

	// Claimed/created concurrently with the warm lookup; the account and ingress feed
	// the worker env, which boot AND tests read.
	const accountId = await resolveWorkerAccount({
		idx,
		name,
		runId,
		owner,
		ownerEmail,
		pooledAccounts,
	});
	bumpStripeDone();
	const stripeMs = Date.now() - fanoutStart;

	let svixAppId: string | undefined;
	if (isSvixShard) {
		svixAppId = await provisionSvixApp(() => orchestratorCreateSvixApp(orgId));
		await registry.addSvixApp({ runId, svixAppId });
	}

	const { publicUrl: ingressUrl, token: ingressToken } = await ingress;

	// Fork with the per-worker env (fork does NOT copy env) from the warm image.
	const sandbox = await forkWorker({
		sourceSandbox: warmName,
		name,
		env: buildWorkerEnv({
			stripeAccountId: accountId,
			stripeSecretKey,
			isSvixShard,
			svixAppId,
			ingressUrl,
			ingressToken,
		}),
		tags: vercelTags(owner, runId),
		signal,
	});
	await registry.addSandbox(runId, { name: sandbox.name, id: sandbox.id });
	const createMs = Date.now() - fanoutStart;

	// On Modal `tunnels()` blocks until the sandbox is actually RUNNING, so the
	// create→tunnel slice captures the snapshot-restore/start wait.
	const publicUrl = await getPublicUrl(sandbox, SERVER_PORT);
	const tunnelMs = Date.now() - fanoutStart;

	log(`worker ${name}: booting${isSvixShard ? " (svix shard)" : ""}`);
	await waitForReady({ sandbox, name, signal });
	log(`worker ${name}: READY`);
	bumpWorkerReady();
	const readyMs = Date.now() - fanoutStart;

	// The RUN phase only starts after every provisionTask resolves, so each
	// mapping is in place before any test fires Stripe events.
	await pushWorkerMapping({
		ingressUrl,
		token: ingressToken,
		accountId,
		workerUrl: publicUrl,
	});

	const handle: WorkerHandle = {
		name,
		sandboxId: sandbox.name,
		publicUrl,
		accountId,
		isSvixShard,
		inFlight: 0,
	};

	return {
		handle,
		sandbox,
		timing: {
			stripeMs,
			createMs,
			checkoutMs: sandbox.checkoutMs ?? 0,
			tunnelMs,
			readyMs,
		},
	};
};

const provisionSvixApp = pLimit(10);

/** Register the per-key platform Connect webhooks pointed at the ingress. */
const registerIngressWebhooks = async ({
	runId,
	ingress,
	usedKeys,
}: {
	runId: string;
	ingress: CreateIngressResult;
	usedKeys: number;
}): Promise<void> => {
	const registerIngress = pLimit(10);
	const registrations = await Promise.allSettled(
		Array.from({ length: usedKeys }, (_, keyIndex) =>
			registerIngress(async () => {
				const webhookId = await registerConnectIngressWebhook(
					ingress.publicUrl,
					stripeKeyByIndex(keyIndex),
				);
				await registry.addWebhook(runId, {
					sandboxName: ingress.sandbox.name,
					accountId: webhookKeyTag(keyIndex),
					webhookId,
				});
			}),
		),
	);
	// Finish recording concurrent successes before a failure starts teardown.
	for (const registration of registrations) {
		if (registration.status === "rejected") throw registration.reason;
	}
};

/** Claim the run's pooled sub-accounts under the `stripe-pool` global lock, recorded in
 * one registry write so a crash can't orphan them. Returns encoded accounts by idx. */
const claimAndRecordPoolAccounts = async ({
	count,
	owner,
	runId,
	ownerEmail,
}: {
	count: number;
	owner: string;
	runId: string;
	ownerEmail: string;
}): Promise<string[]> => {
	const claimStart = Date.now();
	const claim = await withGlobalLock({
		name: "stripe-pool",
		meta: { owner, startedAt: Date.now(), runId },
		log: (line) => log(line),
		fn: () =>
			claimPoolAccounts({
				count,
				owner,
				runId,
				ownerEmail,
				orgId: TEST_ORG_CONFIG.id,
				orgNameForIdx: (idx) =>
					`${TEST_ORG_CONFIG.name} (${sandboxName(owner, runId, idx)})`,
				log: (line) => log(line),
			}),
	});
	await registry.addSubAccounts(runId, claim.byWorker);
	milestone(
		`stripe pool: ${claim.reused} reused + ${claim.created} created in ${Date.now() - claimStart}ms`,
	);
	return claim.byWorker;
};

// ============================================================================
// Teardown (§9a — idempotent, orchestrator-driven from the registry)
// ============================================================================

/**
 * Persistent Stripe sub-account pool: claim clean accounts at fan-out, async-
 * nuke at teardown (see STRIPE_POOL_BENCH.md). Modal-only — the detached nuke
 * sandbox is a Modal registry image; other providers keep the create/delete
 * path. `TW_DISABLE_STRIPE_POOL=1` is the escape hatch.
 */
const stripePoolEnabled = (): boolean =>
	providerName().startsWith("modal") &&
	process.env.TW_DISABLE_STRIPE_POOL !== "1";

const NUKE_SCRIPT = "scripts/tw/image/nuke-accounts.mjs";

/**
 * Fire-and-forget the teardown nuke sandbox: it cleans each used account's
 * contents and flips its pool state back to clean (plus reclaims stale-dirty
 * accounts from crashed runs). Returns false if the spawn failed so the caller
 * can fall back to synchronous account deletion.
 */
const spawnNukeSandbox = async (
	runId: string,
	encodedAccounts: string[],
): Promise<boolean> => {
	try {
		const script = readInlineBunScript(NUKE_SCRIPT);
		const targets = encodedAccounts.map((encoded) => {
			const { accountId, keyIndex } = decodeSubAccount(encoded);
			return { accountId, keyIndex };
		});
		const sandboxId = await spawnDetachedNukeSandbox({
			name: `tw-nuke-${runId}`,
			script,
			env: {
				NUKE_TARGETS: JSON.stringify(targets),
				NUKE_KEYS: JSON.stringify(allPoolKeys()),
				NUKE_STALE_SWEEP: "1",
			},
		});
		log(
			`teardown: nuke sandbox ${sandboxId} spawned for ${encodedAccounts.length} account(s) — not waiting`,
		);
		return true;
	} catch (error) {
		warn(
			`teardown: nuke sandbox spawn failed (${(error as Error).message}) — falling back to sync deletes`,
		);
		return false;
	}
};

/**
 * Delete the run's single dedicated Svix shard app (plan §7/§9a teardown step 3).
 * Reuses the server's `deleteSvixApp` (the `svix` package isn't resolvable from
 * the scripts workspace — it's nested under `server/node_modules` — so we go
 * through the `@server/*` alias, the same way the worker's boot provisions the
 * app). It is wrapped in `safeSvix`, so it no-ops without `SVIX_API_KEY` and
 * swallows "already deleted", keeping teardown idempotent. Exported so `kill.ts`
 * reuses the exact teardown step.
 */
export const deleteSvixApp = async (appId: string): Promise<void> => {
	if (!process.env.SVIX_API_KEY) {
		warn(`SVIX_API_KEY not set — cannot delete svix app ${appId} (skipping)`);
		return;
	}
	await serverDeleteSvixApp({ appId });
};

/**
 * Tear down every resource recorded for `runId`, then mark the entry completed.
 * Idempotent and time-boxed per resource (a hung sandbox can't block exit).
 * `skip` short-circuits everything (`--keep`).
 */
const teardown = async ({
	runId,
	skip,
}: {
	runId: string;
	skip: boolean;
}): Promise<void> => {
	if (skip) {
		log("--keep set: leaving the pool up (clean up later with `bun tw kill`)");
		return;
	}

	const entry = await registry.getRun(runId);
	if (!entry) {
		return;
	}

	log(
		`teardown: ${entry.subAccounts.length} sub-account(s), ${entry.webhooks.length} webhook(s), ${entry.sandboxes.length} sandbox(es)`,
	);

	// Pool mode: hand the used accounts to a detached nuke sandbox (contents
	// cleaned + marked clean asynchronously) so the terminal returns immediately.
	// Fallback (spawn failure / non-modal): delete sub-accounts CONCURRENTLY
	// (bounded) — serial Stripe deletes are the teardown long-pole.
	setTeardownAccounts(0, entry.subAccounts.length);
	const nukeSpawned =
		stripePoolEnabled() &&
		entry.subAccounts.length > 0 &&
		(await spawnNukeSandbox(runId, entry.subAccounts));
	if (nukeSpawned) {
		setTeardownAccounts(entry.subAccounts.length, entry.subAccounts.length);
	} else {
		const accountLimit = pLimit(TEARDOWN_STRIPE_CONCURRENCY);
		await Promise.all(
			entry.subAccounts.map((accountId) =>
				accountLimit(async () => {
					await timeBoxed(`delete sub-account ${accountId}`, () =>
						deleteSubAccount(accountId),
					);
					bumpAccountDone();
				}),
			),
		);
	}

	// Delete recorded webhooks (the shared platform Connect webhook). Unlike a
	// sub-account's account-scoped webhook, the platform Connect webhook is NOT
	// cascade-deleted by sub-account deletion, so drop it explicitly (§9a).
	for (const webhook of entry.webhooks) {
		// The webhook lives on the pool key tagged in `accountId` ("platform::<idx>").
		const webhookKey = stripeKeyByIndex(
			keyIndexFromWebhookTag(webhook.accountId),
		);
		await timeBoxed(`delete connect webhook ${webhook.webhookId}`, () =>
			deleteConnectWebhook(webhook.webhookId, webhookKey),
		);
	}

	for (const appId of registry.getSvixAppIds(entry)) {
		await timeBoxed(`delete svix app ${appId}`, () => deleteSvixApp(appId));
	}

	// Delete sandboxes concurrently too (bounded) — terminating N µVMs serially is
	// the other teardown long-pole.
	setTeardownSandboxes(0, entry.sandboxes.length);
	const sandboxLimit = pLimit(TEARDOWN_SANDBOX_CONCURRENCY);
	await Promise.all(
		entry.sandboxes.map((sandbox) =>
			sandboxLimit(async () => {
				// Prefer the sandboxId (Modal V2 has no name lookup — only fromId);
				// fall back to name for older registry entries / other providers.
				await timeBoxed(`delete sandbox ${sandbox.name}`, () =>
					deleteSandbox(sandbox.id ?? sandbox.name),
				);
				bumpSandboxDone();
			}),
		),
	);

	await registry.markCompleted(runId);
	log("teardown complete");
};

const statFor = ({
	provisioned,
	pick,
}: {
	provisioned: ProvisionedWorker[];
	pick: (timing: ProvisionedWorker["timing"]) => number;
}): DurationStats =>
	summarizeDurations(provisioned.map(({ timing }) => pick(timing)));

/**
 * Setup timeline + per-worker fan-out splits, shown on the terminal and saved to
 * `<runId>-timings.json` so runs can be compared.
 */
const reportFanoutBenchmark = ({
	provisioned,
	effectiveWorkers,
	logFile,
	runId,
}: {
	provisioned: ProvisionedWorker[];
	effectiveWorkers: number;
	logFile: string;
	runId: string;
}): void => {
	const fanout = {
		ready: statFor({ provisioned, pick: (t) => t.readyMs }),
		accountWait: statFor({ provisioned, pick: (t) => t.stripeMs }),
		create: statFor({
			provisioned,
			pick: (t) => t.createMs - t.stripeMs - t.checkoutMs,
		}),
		checkout: statFor({ provisioned, pick: (t) => t.checkoutMs }),
		restore: statFor({ provisioned, pick: (t) => t.tunnelMs - t.createMs }),
		boot: statFor({ provisioned, pick: (t) => t.readyMs - t.tunnelMs }),
	};
	const bootSteps = summarizeBootTraces();

	milestone("setup timeline (since invocation):");
	for (const line of formatSetupTimeline()) {
		milestone(line);
	}
	milestone(
		`fan-out benchmark (${provisioned.length}/${effectiveWorkers} workers, ${WORKER_VCPUS} vCPU each):`,
	);
	milestone(`  · READY (from fan-out start): ${formatDurations(fanout.ready)}`);
	milestone(
		`      ├─ wait for stripe acct:  ${formatDurations(fanout.accountWait)}`,
	);
	milestone(
		`      ├─ create (fork call):    ${formatDurations(fanout.create)}`,
	);
	milestone(
		`      ├─ source fast-forward:   ${formatDurations(fanout.checkout)}`,
	);
	milestone(
		`      ├─ restore (tunnel):      ${formatDurations(fanout.restore)}`,
	);
	milestone(`      └─ boot (exec → READY):   ${formatDurations(fanout.boot)}`);
	for (const line of formatBootSummary(bootSteps)) {
		milestone(line);
	}

	try {
		writeFileSync(
			logFile.replace(/\.log$/, "-timings.json"),
			JSON.stringify(
				{
					runId,
					workers: provisioned.length,
					setupTimeline: getSetupTimeline(),
					fanout,
					bootSteps,
				},
				null,
				2,
			),
		);
	} catch {
		// best-effort — the terminal lines above carry the same numbers.
	}
};

// ============================================================================
// Main run
// ============================================================================

export const run = async (args: TwRunArgs): Promise<void> => {
	// Select the cloud backend (Vercel default; Modal via --provider=modal). The
	// chosen backend module is dynamically imported so the unused SDK never loads.
	await setProvider(args.provider);
	const owner = getOwner();
	const runId = newRunId();
	const ownerEmail = process.env.TW_OWNER_EMAIL ?? OWNER_EMAIL_FALLBACK;

	// Point the log sink at this run's log file. During the RUN phase (Ink mounted)
	// quiet mode routes ALL orchestrator/ingress/worker-boot logging here instead of
	// stdout, so Ink owns the terminal; resolve/warm-up/fan-out/teardown still print
	// to stdout. The file keeps the full firehose for `bun tw` to point the user at.
	const runLogFile = join(REGISTRY_DIR, "runs", `${runId}.log`);
	setLogFile(runLogFile);
	resetSetupTimeline();
	resetBootTraces();

	log(`resolving test files for: ${args.groupsOrPatterns.join(" ") || "core"}`);
	const allFiles = await timePhase({
		name: "resolve test files",
		fn: () => resolveTestFiles(args.groupsOrPatterns),
	});
	if (allFiles.length === 0) {
		throw new Error("no test files resolved — nothing to run");
	}

	// Stripe key-pool preflight (only when a pool is configured): probe each key's
	// Connect/v2-accounts capability and DROP the dead ones up-front, so workers
	// aren't assigned to keys that can't create their sub-account (67/90 cryptic
	// mid-fan-out failures). Read-only + fast; runs before the expensive warm-up.
	if (stripeKeyPoolSize() > 1) {
		milestone(`validating ${stripeKeyPoolSize()} Stripe pool key(s)…`);
		const { usable, dropped } = await timePhase({
			name: "validate stripe keys",
			fn: validateStripeKeyPool,
		});
		for (const badKey of dropped) {
			warn(`Stripe key ${badKey.keyPrefix} unusable — ${badKey.reason}`);
		}
		if (usable === 0) {
			throw new Error(
				"no usable Stripe pool keys: every STRIPE_TEST_KEY_POOL key failed the Connect probe — enable Connect + the v2 Accounts API on those platform accounts",
			);
		}
		milestone(
			dropped.length > 0
				? `Stripe key pool: ${usable}/${usable + dropped.length} key(s) usable — sharding across them (enable Connect on the rest to use all ${usable + dropped.length})`
				: `Stripe key pool: all ${usable} key(s) usable`,
		);
	}

	const { svixFiles, normalFiles } = await partitionShards(allFiles);

	const requestedWorkers = Math.max(1, args.workers);
	const { totalWorkers: effectiveWorkers, svixWorkers } = planShardWorkers({
		workers: requestedWorkers,
		normalFileCount: normalFiles.length,
		svixFileCount: svixFiles.length,
	});
	if (svixWorkers > 0) requireSecret("SVIX_API_KEY");
	log(
		`running ${normalFiles.length} normal and ${svixFiles.length} Svix files on ${effectiveWorkers} isolated workers`,
	);

	// Size the per-worker Stripe budget now that the pool size is final — every
	// worker env built below reads it.
	stripeBudget = stripeBudgetForRun({
		workers: effectiveWorkers,
		keys: stripeKeyPoolSize(),
	});
	balanceWorkerEnabled = args.balanceWorker;

	// No per-worker webhook cap: the swarm registers ONE shared platform Connect
	// webhook → the ingress sandbox, which routes each event to the owning worker by
	// `event.account` (§6a). This removes the old Stripe 16-webhook/account ceiling.
	const maxParallel = effectiveWorkers * Math.max(1, args.perWorker);

	log(
		`pool: ${effectiveWorkers} worker(s) (requested ${requestedWorkers}, files ${normalFiles.length}), maxParallel=${maxParallel}`,
	);
	log(
		`stripe budget: ${stripeBudget.maxRps} req/s · ${stripeBudget.maxInFlight} in flight per worker (${stripeKeyPoolSize()} key(s), ~${Math.ceil(effectiveWorkers / stripeKeyPoolSize())} worker(s) per key)`,
	);

	await registry.createRun({
		owner,
		runId,
		ref: args.ref,
		provider: args.provider,
	});
	log(`run ${runId} (owner=${owner}, ref=${args.ref}, env=${TW_ENV})`);

	// ----- TUI ------------------------------------------------------------
	// Mount the opentui two-pane TUI for the WHOLE lifecycle (warm → fan-out → run
	// → teardown → summary). Quiet mode routes ALL sink output to the run log file
	// + the logs pane so the TUI owns the terminal. Only for an interactive TTY;
	// non-TTY (CI/piped) keeps the plain stdout logging. The JSX module is
	// dynamic-imported (the scripts tsconfig compiles only `.ts`, no `--jsx`).
	const swarmTarget = args.groupsOrPatterns.join(" ") || "core";

	// ----- DASHBOARD (optional, WS on a random port) ----------------------
	let dashboard: DashboardServer | undefined;
	if (args.dashboard) {
		resetHub();
		ensureDashboardSpa();
		dashboard = startDashboardServer();
		// Copy the URL + open it in the browser (best-effort).
		copyToClipboard(dashboard.webUrl);
		openInBrowser(dashboard.webUrl);
		const hint = dashboard.servingSpa
			? "(copied to clipboard · opening in your browser)"
			: "(copied to clipboard — build the dashboard once: `cd apps/testbench && bun run build`, or run its dev server: `bun dev`)";
		// Print to the normal screen BEFORE the TUI takes the alt-screen.
		process.stdout.write(
			`\n📊 tw dashboard: ${dashboard.webUrl}\n   ${hint}\n\n`,
		);
	}

	const useTui = Boolean(process.stdout.isTTY);
	let tui:
		| { mountTui: () => Promise<void>; unmountTui: () => void }
		| undefined;
	if (useTui) {
		const mountSpecifier = "../tui/mount.tsx";
		tui = (await import(mountSpecifier)) as {
			mountTui: () => Promise<void>;
			unmountTui: () => void;
		};
		resetTui();
		// AFTER resetTui (which clears it) so the URL persists in the header.
		if (dashboard) {
			setDashboardUrl(dashboard.webUrl);
		}
		setRunMeta(swarmTarget, effectiveWorkers);
		setPhase("warm");
		await tui.mountTui();
		enableQuietMode();
	}

	// ----- SIGINT/SIGTERM guard (plan §9a) -----------------------------------
	const abortController = new AbortController();
	let teardownStarted = false;
	let forceExitArmed = false;

	const onSignal = (signalName: string): void => {
		if (forceExitArmed) {
			errorLog(
				`second ${signalName}: force-exit — resources persist, recover with \`bun tw kill ${runId}\``,
			);
			process.exit(SIGINT_EXIT_CODE);
		}
		if (teardownStarted) {
			// Already tearing down; arm force-exit for the next signal.
			forceExitArmed = true;
			warn("teardown in progress — press Ctrl+C again to force-exit");
			return;
		}
		teardownStarted = true;
		forceExitArmed = true;
		// Restore the terminal before printing teardown logs.
		tui?.unmountTui();
		disableQuietMode();
		warn(`${signalName}: stopping scheduling and tearing down…`);
		abortController.abort();
		void (async () => {
			await teardown({ runId, skip: args.keep });
			await registry.markCancelled(runId).catch(() => {
				// best-effort; the registry may already be gone
			});
			process.exit(SIGINT_EXIT_CODE);
		})();
	};

	const sigintHandler = (): void => onSignal("SIGINT");
	const sigtermHandler = (): void => onSignal("SIGTERM");
	process.on("SIGINT", sigintHandler);
	process.on("SIGTERM", sigtermHandler);

	const signal = abortController.signal;
	let teardownDone = false;

	try {
		// ----- SHARED SETUP (concurrent) ---------------------------------------
		// Warm lookup, ingress (+ its Connect webhooks) and the Stripe pool claim are
		// independent. Workers fork as soon as the warm image is known; each awaits
		// its account right before boot and the ingress right before its map push.
		const refSha = resolveRefSha(args.ref);
		resolvedTargetSha = refSha;
		const warmPromise = timePhase({
			name: "warm parent",
			fn: () => getOrBuildWarmParent({ ref: args.ref, sha: refSha, signal }),
		});

		// ONE shared Connect webhook ingress: Stripe → the platform Connect webhook →
		// ingress → the owning worker, routed by `event.account` (replaces the
		// per-worker webhook + its 16-cap, §6a). Recorded so teardown drops it.
		log("creating shared Connect webhook ingress");
		const ingressPromise = timePhase({
			name: "ingress sandbox",
			fn: async () => {
				const created = await createIngress({ owner, runId, signal });
				await registry.addSandbox(runId, {
					name: created.sandbox.name,
					id: created.sandbox.id,
				});
				return created;
			},
		});
		// One Connect webhook PER pool key actually in use (each platform key only
		// delivers events for the accounts it owns). Only needed before tests run.
		const usedKeys = Math.min(stripeKeyPoolSize(), effectiveWorkers);
		const webhooksPromise = ingressPromise.then((ingress) =>
			timePhase({
				name: "connect webhooks",
				fn: () =>
					registerIngressWebhooks({
						runId,
						ingress,
						usedKeys,
					}),
			}),
		);

		// Claim pooled Stripe sub-accounts (reuse clean, create the shortfall) under
		// the cross-machine git-ref lock — Stripe metadata read-modify-write is racy
		// when teammates fan out concurrently. Recorded before any worker boots.
		const pooledAccountsPromise: Promise<string[] | undefined> =
			stripePoolEnabled()
				? timePhase({
						name: "stripe pool claim",
						fn: () =>
							claimAndRecordPoolAccounts({
								count: effectiveWorkers,
								owner,
								runId,
								ownerEmail,
							}),
					})
				: Promise.resolve(undefined);

		const sharedSetup = Promise.allSettled([
			ingressPromise,
			webhooksPromise,
			pooledAccountsPromise,
		]);
		let warmName: string;
		try {
			warmName = await warmPromise;
		} catch (error) {
			// Let in-flight shared resources get recorded before teardown reads them.
			await sharedSetup;
			throw error;
		}

		// ----- FAN-OUT --------------------------------------------------------
		milestone(
			`fan-out: provisioning ${effectiveWorkers} worker(s) from the warm snapshot`,
		);
		setPhase("fanout");
		setFanoutTotals(effectiveWorkers);
		// Worker names are deterministic, so the dashboard can show the FULL grid
		// (as gray "provisioning" placeholders) before any worker registers itself.
		const expectedNames = Array.from({ length: effectiveWorkers }, (_, idx) =>
			sandboxName(owner, runId, idx),
		);
		registerExpectedWorkers(expectedNames);
		const fanoutStart = Date.now();
		const provisionTasks: Promise<ProvisionedWorker>[] = [];
		for (let idx = 0; idx < effectiveWorkers; idx++) {
			const isSvixShard = idx < svixWorkers;
			const workerName = expectedNames[idx];
			provisionTasks.push(
				provisionWorker({
					idx,
					owner,
					runId,
					warmName,
					isSvixShard,
					ownerEmail,
					pooledAccounts: pooledAccountsPromise,
					ingress: ingressPromise,
					fanoutStart,
					signal,
				}).catch((error: unknown) => {
					// Surface the provision failure (red dot + reason, `N failed` counter)
					// instead of the worker silently never appearing.
					const reason = error instanceof Error ? error.message : String(error);
					setWorkerStatus(workerName, "failed", reason.slice(0, 300));
					bumpWorkerFailed();
					throw error;
				}),
			);
		}
		// Wait for ALL provisionWorker tasks AND the shared setup to SETTLE (not just
		// bail on the first rejection) so every sub-account/sandbox/webhook is
		// recorded before teardown reads the registry.
		const settled = await timePhase({
			name: "fan-out (all workers READY)",
			fn: () => Promise.allSettled(provisionTasks),
		});
		for (const result of await sharedSetup) {
			if (result.status === "rejected") throw result.reason;
		}
		log(
			`ingress ready (${(await ingressPromise).publicUrl}), ${usedKeys} platform Connect webhook(s) registered across the key pool`,
		);
		const provisioned = settled
			.filter(
				(r): r is PromiseFulfilledResult<ProvisionedWorker> =>
					r.status === "fulfilled",
			)
			.map((r) => r.value);
		const failures = settled.filter(
			(r): r is PromiseRejectedResult => r.status === "rejected",
		);
		const firstFailure =
			failures[0] &&
			(failures[0].reason instanceof Error
				? failures[0].reason.message
				: String(failures[0].reason));

		// Partial fan-out failures are TOLERATED: a few workers losing the (often
		// transient) fork/boot race shouldn't waste the dozens that came up healthy.
		// Proceed with whoever provisioned; the failed workers' partial resources are
		// recorded in the registry and get cleaned up at teardown. Only a TOTAL
		// wipeout (zero healthy) is fatal.
		if (failures.length > 0) {
			warn(
				`fan-out: ${failures.length}/${effectiveWorkers} worker(s) failed to provision (first: ${firstFailure})`,
			);
		}
		if (provisioned.length === 0) {
			milestone(
				`✗ fan-out: all ${effectiveWorkers} worker(s) failed to provision`,
			);
			if (firstFailure && /not found|shut down/i.test(firstFailure)) {
				milestone(
					"  hint: workers crashed on start. Try smaller workers (TW_MODAL_WORKER_CPU=2 TW_MODAL_WORKER_MEM_MIB=4096) to rule out a Modal resource-quota kill",
				);
			}
			throw new Error(
				`fan-out: all ${effectiveWorkers} worker(s) failed to provision — aborting (first: ${firstFailure})`,
			);
		}
		if (failures.length > 0) {
			milestone(
				`fan-out: proceeding with ${provisioned.length}/${effectiveWorkers} healthy worker(s)`,
			);
		}

		reportFanoutBenchmark({
			provisioned,
			effectiveWorkers,
			logFile: runLogFile,
			runId,
		});

		// `--fanout-bench`: we only wanted the fan-out timings — skip the test run
		// and tear straight down (saves the test compute/credits). The finally still
		// guards teardown via `teardownDone`.
		if (args.fanoutBench) {
			milestone(
				"--fanout-bench: provisioned + measured; skipping tests, tearing down",
			);
			setPhase("teardown");
			await teardown({ runId, skip: args.keep });
			teardownDone = true;
			setPhase("done");
			return;
		}

		// ----- RUN ------------------------------------------------------------
		const sandboxByName = new Map<string, ProviderSandbox>();
		for (const { handle, sandbox } of provisioned) {
			sandboxByName.set(handle.name, sandbox);
		}

		const resolveSandbox = (
			worker: WorkerHandle,
		): ProviderSandbox | undefined => sandboxByName.get(worker.name);
		const svixHandles = provisioned
			.filter(({ handle }) => handle.isSvixShard)
			.map(({ handle }) => handle);
		const normalHandles = provisioned
			.filter(({ handle }) => !handle.isSvixShard)
			.map(({ handle }) => handle);
		if (svixFiles.length > 0 && svixHandles.length === 0)
			throw new Error(
				"No Svix workers provisioned; cannot run selected Svix tests",
			);
		if (normalFiles.length > 0 && normalHandles.length === 0)
			throw new Error(
				"No normal workers provisioned; cannot run selected tests",
			);

		const svixPool = new WorkerPool(svixHandles, 1);
		const normalPool = new WorkerPool(
			normalHandles,
			Math.max(1, args.perWorker),
		);

		const stopCulling = startCulling(normalPool, resolveSandbox);
		markPhase("first test dispatched");
		milestone(
			"run: executing tests across both pools — live progress in the dashboard",
		);
		setPhase("run");
		const runPhaseStart = Date.now();
		try {
			await runShardTests({
				shards: [
					{
						files: svixFiles,
						executor: new RemoteExecutor({
							pool: svixPool,
							resolveSandbox,
							toWorkerPath: toSandboxPath,
						}),
						maxParallel: Math.max(1, svixHandles.length),
					},
					{
						files: normalFiles,
						executor: new RemoteExecutor({
							pool: normalPool,
							resolveSandbox,
							toWorkerPath: toSandboxPath,
						}),
						maxParallel: Math.max(1, normalHandles.length * args.perWorker),
					},
				],
			});
		} finally {
			stopCulling();
			svixPool.close();
			normalPool.close();
		}

		lastRunWallMs = Date.now() - runPhaseStart;

		// Worst verdict → process exit code, from the swarm store's per-file results.
		const runResults = Array.from(getTuiState().files.values());
		lastRunExitCode = runResults.some((file) => file.status === "failed")
			? 1
			: 0;

		// Publish the summary BEFORE teardown so the dashboard shows passed/failed/
		// crashed/wall/cost immediately — teardown takes a few seconds and the
		// numbers shouldn't wait on it. The cost is refined after teardown (true
		// sandbox lifetime, fan-out start → teardown complete).
		let totalPassed = 0;
		let totalFailed = 0;
		let totalCrashed = 0;
		for (const file of runResults) {
			totalPassed += file.passed;
			totalFailed += file.failed;
			if (file.crashError) {
				totalCrashed++;
			}
		}
		// FILE-level failures: an exec death fails a file with 0 test-assert
		// failures, so `totalFailed` alone can read "0 failed" while files failed.
		const totalFilesFailed = runResults.filter(
			(file) => file.status === "failed",
		).length;
		// Kept in scope for the final stdout line after the TUI exits.
		let costLine: string | undefined;
		const publishSummary = (lifetimeMs: number): void => {
			// Cost ESTIMATE (the SDK doesn't expose usage for running sandboxes, see
			// cost.ts): workers + the ingress at WORKER_VCPUS, alive fan-out→now.
			lastRunCost = estimateCost({
				workers: provisioned.length + 1,
				vcpus: WORKER_VCPUS,
				lifetimeMs,
			});
			costLine = lastRunCost.totalUsd > 0 ? formatCost(lastRunCost) : undefined;
			setSummary({
				passed: totalPassed,
				failed: totalFailed,
				filesFailed: totalFilesFailed,
				crashed: totalCrashed,
				wallMs: lastRunWallMs,
				costLine,
				logFile: runLogFile,
			});
			writeFileSync(
				runLogFile.replace(/\.log$/, ".json"),
				JSON.stringify({ runId, snapshot: getDashboardSnapshot() }, null, 2),
			);
		};
		// Preliminary publish — sandboxes are about to be torn down, so this
		// lifetime is within a few seconds of the final.
		publishSummary(Date.now() - fanoutStart);

		// ----- TEARDOWN -------------------------------------------------------
		milestone(
			args.keep
				? "teardown: skipped (--keep) — clean up later with `bun tw kill`"
				: "teardown: releasing sandboxes + Stripe sub-accounts",
		);
		setPhase("teardown");
		await teardown({ runId, skip: args.keep });
		teardownDone = true;

		// ----- SUMMARY (refine) -----------------------------------------------
		// Re-publish with the true sandbox lifetime (fan-out start → teardown
		// complete); pass/fail/wall are unchanged, only the cost estimate tightens.
		publishSummary(Date.now() - fanoutStart);
		setPhase("done");

		// Build a durable failure report (the swarm streams test output through the
		// TUI store, which is gone after exit — persist the failures so they survive).
		const failedFiles = runResults.filter(
			(file) => file.status === "failed" || Boolean(file.crashError),
		);
		const failureReport: string[] = [];
		for (const file of failedFiles) {
			failureReport.push(`\n✗ ${file.file}`);
			if (file.crashError) {
				// Bun stderr's first line is just the file header — keep enough lines
				// to surface the real cause (panic, unhandled error, matched-0-tests).
				const crashLines = file.crashError
					.split("\n")
					.filter((line) => line.trim())
					.slice(0, 6);
				failureReport.push(`    CRASH: ${crashLines.shift() ?? ""}`);
				for (const line of crashLines) {
					failureReport.push(`        ${line}`);
				}
			}
			for (const test of file.failedTests) {
				failureReport.push(`    ✗ ${test.name}`);
				if (test.location) {
					failureReport.push(`        ${test.location}`);
				}
				if (test.message) {
					failureReport.push(`        ${test.message}`);
				}
			}
		}
		let failuresFile: string | undefined;
		if (failureReport.length > 0) {
			failuresFile = join(REGISTRY_DIR, "runs", `${runId}-failures.txt`);
			try {
				writeFileSync(
					failuresFile,
					`${failureReport.join("\n").trimStart()}\n`,
				);
			} catch {
				// best-effort — the in-terminal dump below still surfaces them.
			}
		}

		if (tui) {
			// Hold the final summary on screen, then restore the terminal.
			await sleep(2500);
			tui.unmountTui();
			disableQuietMode();
		}
		log(
			totalFilesFailed > 0
				? `done — ${totalPassed} passed · ${totalFilesFailed} file(s) failed (${totalFailed} test assert(s) failed, ${totalCrashed} crashed) · ${formatWall(lastRunWallMs)}${costLine ? ` · ${costLine}` : ""}`
				: `done — ${totalPassed} passed, ${totalFailed} failed, ${totalCrashed} crashed · ${formatWall(lastRunWallMs)}${costLine ? ` · ${costLine}` : ""}`,
		);

		// Surface the failures right in the terminal (TUI is down now → stdout).
		if (failureReport.length > 0) {
			errorLog(`${failedFiles.length} file(s) failed:`);
			for (const line of failureReport) {
				sinkLine(line);
			}
			if (failuresFile) {
				log(`failures saved to ${failuresFile}`);
			}
		}
		if (runLogFile) {
			log(`full run log: ${runLogFile}`);
		}
	} finally {
		process.off("SIGINT", sigintHandler);
		process.off("SIGTERM", sigtermHandler);
		// Always restore the terminal (idempotent) — on an error path the TUI may
		// still be mounted; tear it down so the error/teardown logs are visible.
		tui?.unmountTui();
		disableQuietMode();
		if (!(teardownDone || teardownStarted)) {
			// An error path that isn't a signal — still attempt teardown so a thrown
			// warm-up/fan-out error doesn't leak the resources created so far.
			await teardown({ runId, skip: args.keep }).catch((error) => {
				warn(`teardown after error failed: ${(error as Error).message}`);
			});
			await registry.markCancelled(runId).catch(() => {
				// best-effort
			});
		}
	}

	// With --dashboard, keep the WS server up after the run so the user can inspect
	// per-file/per-worker output + the final summary. Block until Ctrl+C.
	if (dashboard) {
		log(`dashboard still live at ${dashboard.webUrl} — press Ctrl+C to exit`);
		await new Promise<void>((resolve) => {
			const done = (): void => resolve();
			process.once("SIGINT", done);
			process.once("SIGTERM", done);
		});
		dashboard.stop();
	}
};

/**
 * Translate an absolute LOCAL test path into the worker-relative path the
 * sandbox checked the repo out at (plan §8.5 "Paths"). Both roots share the
 * `server/tests/...` suffix, so we rebase off the local PROJECT_ROOT onto the
 * in-sandbox repo root.
 */
const toSandboxPath = (localFile: string): string => {
	if (localFile.startsWith(`${PROJECT_ROOT}/`)) {
		return `${sandboxRepoRoot()}/${localFile.slice(PROJECT_ROOT.length + 1)}`;
	}
	return localFile;
};

/**
 * The worst test verdict of the last run (0 = all passed, 1 = any file failed).
 * `index.ts` propagates it to the process exit code. Computed after the RUN phase
 * from the swarm store's per-file results.
 */
let lastRunExitCode = 0;

/** RUN-phase wall-clock (ms) of the last run — the correct parallel-aware test time. */
let lastRunWallMs = 0;
/** Cost estimate of the last run (computed at summary from worker count + lifetime). */
let lastRunCost: CostEstimate | undefined;
export const getLastRunWallMs = (): number => lastRunWallMs;
export const getLastRunCost = (): CostEstimate | undefined => lastRunCost;

export const getLastRunExitCode = (): number => lastRunExitCode;
