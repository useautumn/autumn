import { randomBytes } from "node:crypto";
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
	WARM_LATEST_BRANCH,
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
	STRIPE_CONNECT_SHARD,
	splitStripeConnectShard,
	unavailableShardExecutor,
} from "../helpers/stripeConnectShard.ts";
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
import { createSvixApp as orchestratorCreateSvixApp } from "../helpers/svix.ts";
import {
	capabilityWorkerEnv,
	maxWorkersFor,
	partitionByCapability,
	type TestCapabilityId,
} from "../helpers/testCapabilities.ts";
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

const BUILD_BASE_SCRIPT = "scripts/tw/image/build-base.sh";
const WARMUP_SCRIPT = "scripts/tw/image/warmup.sh";

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
	const token = process.env.TW_GIT_TOKEN;
	return token
		? { url, revision: ref, username: "x-access-token", password: token }
		: { url, revision: ref };
};
const BOOT_SCRIPT = "scripts/tw/worker/boot.ts";

const OWNER_EMAIL_FALLBACK = "tw@autumn.test";

const TEARDOWN_PER_RESOURCE_TIMEOUT_MS = 20_000;

const TEARDOWN_STRIPE_CONCURRENCY = 16;
const TEARDOWN_SANDBOX_CONCURRENCY = 16;

const CULL_IDLE_FLOOR = Number(process.env.TW_CULL_IDLE_FLOOR ?? 4);
const CULL_INTERVAL_MS = 2000;
const CULL_DISABLED = process.env.TW_DISABLE_CULL === "1";

export const cullExcessIdle = ({
	pool,
	floor = CULL_IDLE_FLOOR,
}: {
	pool: WorkerPool;
	floor?: number;
}): { culled: WorkerHandle[]; reserve: number } => {
	const busy = pool.size - pool.idleCount;
	const reserve = Math.max(floor, busy);
	const excess = pool.idleCount - reserve;
	if (excess <= 0) return { culled: [], reserve };
	return { culled: pool.cullIdle(excess, busy + reserve), reserve };
};

export const startCulling = (
	pool: WorkerPool,
	resolveSandbox: (worker: WorkerHandle) => ProviderSandbox | undefined,
): (() => void) => {
	if (CULL_DISABLED) {
		return () => {};
	}
	let culledTotal = 0;
	const timer = setInterval(() => {
		const { culled, reserve } = cullExcessIdle({ pool });
		for (const worker of culled) {
			setWorkerStatus(worker.name, "dead");
			const sandbox = resolveSandbox(worker);
			if (sandbox) {
				void deleteSandbox(sandbox).catch(() => {});
			}
		}
		if (culled.length > 0) {
			culledTotal += culled.length;
			milestone(
				`cull: freed ${culled.length} idle worker(s) → pool ${pool.size} (keeping ${reserve} idle; ${culledTotal} culled total)`,
			);
		}
	}, CULL_INTERVAL_MS);
	return () => clearInterval(timer);
};

const WORKER_READY_TIMEOUT_MS = 5 * 60 * 1000;

const SIGINT_EXIT_CODE = 130;

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const elapsedTag = (): string => `+${(elapsedMs() / 1000).toFixed(1)}s`;

const log = (message: string): void => {
	sinkLine(chalk.cyan(`[tw] ${elapsedTag()} ${message}`));
};

const milestone = (message: string): void => {
	narrate(chalk.cyan.bold(`[tw] ${elapsedTag()} ${message}`));
};

const warn = (message: string): void => {
	sinkLine(chalk.yellow(`[tw] ${elapsedTag()} ${message}`));
};

const errorLog = (message: string): void => {
	sinkLine(chalk.red(`[tw] ${elapsedTag()} ${message}`));
};

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
	} catch {}
};

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
		} catch {}
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

const openInBrowser = (url: string): void => {
	const argv =
		process.platform === "darwin"
			? ["open", url]
			: process.platform === "win32"
				? ["cmd", "/c", "start", "", url]
				: ["xdg-open", url];
	try {
		Bun.spawn(argv, { stdout: "ignore", stderr: "ignore" });
	} catch {}
};

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

const TESTS_DIR = join(PROJECT_ROOT, "server", "tests");

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

type WarmUpResult = {
	warmSnapshotId: string;
};

const requireSecret = (name: string): string => {
	const value = process.env[name];
	if (!value) {
		throw new Error(
			`[tw] missing required secret ${name} in the orchestrator env (resolve via Infisical / .env before \`bun tw\`)`,
		);
	}
	return value;
};

let resolvedTargetSha = "";

let stripeBudget = stripeBudgetForRun({
	workers: 1,
	keys: stripeKeyPoolSize(),
});
let balanceWorkerEnabled = true;
const customerJwtSecret = randomBytes(32).toString("hex");

export const buildWorkerEnv = ({
	stripeAccountId,
	stripeSecretKey,
	capabilities,
	svixAppId,
	stripeClientId,
	ingressUrl,
	ingressToken,
}: {
	stripeAccountId: string;
	stripeSecretKey: string;
	capabilities: TestCapabilityId[];
	svixAppId?: string;
	stripeClientId?: string;
	ingressUrl: string;
	ingressToken: string;
}): Record<string, string> => {
	const env: Record<string, string> = {
		NODE_ENV: "development",
		SERVER_PORT: String(SERVER_PORT),
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
		AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN:
			"arn:aws:iam::000000000000:role/fakecloud-scheduler",
		KAFKA_BROKERS,
		KAFKA_AUTH_MODE: "none",
		BALANCE_WORKER_DEPLOYMENT: "local",
		BALANCE_WORKER_ROLLOUT_ENABLED: String(balanceWorkerEnabled),
		ENCRYPTION_IV: requireSecret("ENCRYPTION_IV"),
		ENCRYPTION_PASSWORD: requireSecret("ENCRYPTION_PASSWORD"),
		BETTER_AUTH_SECRET: requireSecret("BETTER_AUTH_SECRET"),
		CUSTOMER_JWT_SECRET: customerJwtSecret,
		CLIENT_URL: "http://localhost:3000",
		REVENUECAT_OAUTH_CLIENT_ID: "tw_placeholder_rc_client_id",
		REVENUECAT_OAUTH_CLIENT_SECRET: "tw_placeholder_rc_client_secret",
		STRIPE_WEBHOOK_SKIP_VERIFY: "true",
		STRIPE_SANDBOX_SECRET_KEY: stripeSecretKey,
		STRIPE_SANDBOX_WEBHOOK_SECRET: "whsec_tw_skipverify",
		STRIPE_ACCOUNT_ID: stripeAccountId,
		TW_STRIPE_INGRESS_URL: ingressUrl,
		TW_STRIPE_INGRESS_TOKEN: ingressToken,
		ORG_ID: TEST_ORG_CONFIG.id,
		TW_TARGET_SHA: resolvedTargetSha,
		TESTS_ORG: TEST_ORG_CONFIG.slug,
		AUTUMN_TEST_BASE_URL: `http://localhost:${SERVER_PORT}`,
		AUTUMN_DB_DIRECT: "1",
		TW_WORKER_MODE: "1",
		// Reused Stripe accounts retain idempotency responses from earlier cloned databases.
		TW_STRIPE_IDEMPOTENCY_NAMESPACE: crypto.randomUUID(),
		TW_STRIPE_REDIS_URL: REDIS_URL,
		TW_STRIPE_MAX_RPS: String(stripeBudget.maxRps),
		TW_STRIPE_MAX_INFLIGHT: String(stripeBudget.maxInFlight),
		...(process.env.TW_STRIPE_TRACE === "1" ? { TW_STRIPE_TRACE: "1" } : {}),
		AUTUMN_EDGE_CONFIG_OVERRIDE_B64: EDGE_CONFIG_OVERRIDE_B64,
	};

	if (process.env.ANTHROPIC_API_KEY) {
		env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
	}

	// Shared dev Tinybird (no in-µVM instance — gVisor blocks it). Flows per-run
	if (
		process.env.TINYBIRD_US_EAST_API_URL &&
		process.env.TINYBIRD_US_EAST_TOKEN
	) {
		env.TINYBIRD_US_EAST_API_URL = process.env.TINYBIRD_US_EAST_API_URL;
		env.TINYBIRD_US_EAST_TOKEN = process.env.TINYBIRD_US_EAST_TOKEN;
		// Raw ClickHouse endpoint — the pipes API can't serve single-event reads,
		if (process.env.TINYBIRD_US_EAST_CLICKHOUSE_URL) {
			env.TINYBIRD_US_EAST_CLICKHOUSE_URL =
				process.env.TINYBIRD_US_EAST_CLICKHOUSE_URL;
		}
	}

	if (process.env.TW_USE_KERNEL && process.env.KERNEL_API_KEY) {
		env.USE_KERNEL_BROWSER = "1";
		env.KERNEL_API_KEY = process.env.KERNEL_API_KEY;
	}

	Object.assign(env, capabilityWorkerEnv(capabilities));
	if (capabilities.includes("svix")) {
		env.SVIX_API_KEY = requireSecret("SVIX_API_KEY");
		if (!svixAppId) {
			throw new Error(
				"[tw] svix shard worker requires the orchestrator-created SVIX_APP_ID",
			);
		}
		env.SVIX_APP_ID = svixAppId;
	}
	if (capabilities.includes(STRIPE_CONNECT_SHARD)) {
		if (!stripeClientId) {
			throw new Error(
				"[tw] stripe-connect shard worker requires its platform's Connect client_id",
			);
		}
		env.STRIPE_SANDBOX_CLIENT_ID = stripeClientId;
	}

	return env;
};

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

const isWarmLatestBranchHead = ({
	ref,
	sha,
}: {
	ref: string;
	sha: string;
}): boolean => {
	if (ref !== WARM_LATEST_BRANCH) return false;
	const { url } = resolveGitSource(WARM_LATEST_BRANCH);
	const { stdout, stderr, exitCode } = Bun.spawnSync(
		["git", "ls-remote", url, `refs/heads/${WARM_LATEST_BRANCH}`],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const head = new TextDecoder().decode(stdout).split(/\s+/)[0];
	if (exitCode !== 0 || !/^[0-9a-f]{40}$/.test(head ?? "")) {
		warn(
			`warm-up: could not resolve ${WARM_LATEST_BRANCH}'s head (${new TextDecoder().decode(stderr).trim().slice(0, 160) || "empty ls-remote"}) — tw-warm:latest left unchanged`,
		);
		return false;
	}
	return head === sha;
};

export const getOrBuildWarmParent = async ({
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

	const failBuild = async (message: string): Promise<never> => {
		milestone(`✗ ${message}`);
		await timeBoxed(`delete warm parent ${warmName}`, () =>
			deleteSandbox(warm),
		);
		throw new Error(message);
	};

	// Vercel µVM (Amazon Linux 2023, dnf). On Modal those are baked into the
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
		await snapshotAndStop(warm, {
			signal,
			shouldPublishLatest: () => isWarmLatestBranchHead({ ref, sha }),
		});
	} catch (error) {
		await failBuild(
			`warm-up failed (snapshot: ${(error as Error).message}) — aborting, no workers forked`,
		);
	}
	milestone(`warm-up: warm parent ${warmName} ready`);
	return warmName;
};

type ProvisionedWorker = {
	handle: WorkerHandle;
	sandbox: ProviderSandbox;
	timing: {
		stripeMs: number;
		createMs: number;
		checkoutMs: number;
		tunnelMs: number;
		readyMs: number;
	};
};

export const waitForReady = async ({
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
	let resolveReady: () => void = () => {};
	const readyPromise = new Promise<void>((resolve) => {
		resolveReady = resolve;
	});

	const onBootChunk = (text: string): void => {
		recordBootOutput({ worker: name, text });
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

const provisionWorker = async ({
	idx,
	owner,
	runId,
	warmName,
	capabilities,
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
	capabilities: TestCapabilityId[];
	ownerEmail: string;
	pooledAccounts: Promise<string[] | undefined>;
	ingress: Promise<CreateIngressResult>;
	fanoutStart: number;
	signal: AbortSignal;
}): Promise<ProvisionedWorker> => {
	const name = sandboxName(owner, runId, idx);
	const orgId = TEST_ORG_CONFIG.id;
	const { key: stripeSecretKey } = stripeKeyForWorker(idx);

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
	if (capabilities.includes("svix")) {
		svixAppId = await provisionSvixApp(() => orchestratorCreateSvixApp(orgId));
		await registry.addSvixApp({ runId, svixAppId });
	}

	const { publicUrl: ingressUrl, token: ingressToken } = await ingress;

	const sandbox = await forkWorker({
		sourceSandbox: warmName,
		name,
		env: buildWorkerEnv({
			stripeAccountId: accountId,
			stripeSecretKey,
			capabilities,
			svixAppId,
			ingressUrl,
			ingressToken,
		}),
		tags: vercelTags(owner, runId),
		signal,
	});
	await registry.addSandbox(runId, { name: sandbox.name, id: sandbox.id });
	const createMs = Date.now() - fanoutStart;

	const publicUrl = await getPublicUrl(sandbox, SERVER_PORT);
	const tunnelMs = Date.now() - fanoutStart;

	log(
		`worker ${name}: booting${capabilities.length > 0 ? ` (${capabilities.join("+")} shard)` : ""}`,
	);
	await waitForReady({ sandbox, name, signal });
	log(`worker ${name}: READY`);
	bumpWorkerReady();
	const readyMs = Date.now() - fanoutStart;

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
		capabilities,
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
	for (const registration of registrations) {
		if (registration.status === "rejected") throw registration.reason;
	}
};

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

const stripePoolEnabled = (): boolean =>
	providerName().startsWith("modal") &&
	process.env.TW_DISABLE_STRIPE_POOL !== "1";

const NUKE_SCRIPT = "scripts/tw/image/nuke-accounts.mjs";

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

export const deleteSvixApp = async (appId: string): Promise<void> => {
	if (!process.env.SVIX_API_KEY) {
		warn(`SVIX_API_KEY not set — cannot delete svix app ${appId} (skipping)`);
		return;
	}
	await serverDeleteSvixApp({ appId });
};

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
	for (const webhook of entry.webhooks) {
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

	setTeardownSandboxes(0, entry.sandboxes.length);
	const sandboxLimit = pLimit(TEARDOWN_SANDBOX_CONCURRENCY);
	await Promise.all(
		entry.sandboxes.map((sandbox) =>
			sandboxLimit(async () => {
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
	} catch {}
};

export const run = async (args: TwRunArgs): Promise<void> => {
	await setProvider(args.provider);
	const owner = getOwner();
	const runId = newRunId();
	const ownerEmail = process.env.TW_OWNER_EMAIL ?? OWNER_EMAIL_FALLBACK;

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

	const partition = await partitionByCapability(allFiles);
	const { normalFiles } = partition;
	const { pooledShards: capabilityShards, stripeConnectShard } =
		splitStripeConnectShard(partition.capabilityShards);
	const stripeConnectFiles = stripeConnectShard?.files ?? [];
	const stripeConnectUnavailable = unavailableShardExecutor({
		reason:
			"bun tw has no dedicated stripe-connect account; run these files on twd",
	});
	if (
		stripeConnectFiles.length > 0 &&
		normalFiles.length === 0 &&
		capabilityShards.length === 0
	) {
		throw new Error(
			"stripe-connect shard not configured: bun tw has no dedicated stripe-connect account; run these files on twd",
		);
	}

	const requestedWorkers = Math.max(1, args.workers);
	const { totalWorkers: effectiveWorkers, capabilityWorkers } =
		planShardWorkers({
			workers: requestedWorkers,
			normalFileCount: normalFiles.length,
			capabilityFileCounts: capabilityShards.map(({ files }) => files.length),
			capabilityMaxWorkers: capabilityShards.map(({ capabilities }) =>
				maxWorkersFor(capabilities),
			),
		});
	if (
		capabilityShards.some(({ capabilities }) => capabilities.includes("svix"))
	)
		requireSecret("SVIX_API_KEY");
	const workerCapabilities = capabilityShards.flatMap(
		({ capabilities }, index) =>
			Array.from({ length: capabilityWorkers[index] ?? 0 }, () => capabilities),
	);
	log(
		`running ${normalFiles.length} normal and ${
			capabilityShards
				.map(
					({ capabilities, files }) =>
						`${files.length} ${capabilities.join("+")}`,
				)
				.join(", ") || "no capability"
		} files on ${effectiveWorkers} isolated workers`,
	);

	stripeBudget = stripeBudgetForRun({
		workers: effectiveWorkers,
		keys: stripeKeyPoolSize(),
	});
	balanceWorkerEnabled = args.balanceWorker;

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

	const swarmTarget = args.groupsOrPatterns.join(" ") || "core";

	let dashboard: DashboardServer | undefined;
	if (args.dashboard) {
		resetHub();
		ensureDashboardSpa();
		dashboard = startDashboardServer();
		copyToClipboard(dashboard.webUrl);
		openInBrowser(dashboard.webUrl);
		const hint = dashboard.servingSpa
			? "(copied to clipboard · opening in your browser)"
			: "(copied to clipboard — build the dashboard once: `cd apps/testbench && bun run build`, or run its dev server: `bun dev`)";
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
		if (dashboard) {
			setDashboardUrl(dashboard.webUrl);
		}
		setRunMeta(swarmTarget, effectiveWorkers);
		setPhase("warm");
		await tui.mountTui();
		enableQuietMode();
	}

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
			forceExitArmed = true;
			warn("teardown in progress — press Ctrl+C again to force-exit");
			return;
		}
		teardownStarted = true;
		forceExitArmed = true;
		tui?.unmountTui();
		disableQuietMode();
		warn(`${signalName}: stopping scheduling and tearing down…`);
		abortController.abort();
		void (async () => {
			await teardown({ runId, skip: args.keep });
			await registry.markCancelled(runId).catch(() => {});
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
		const refSha = resolveRefSha(args.ref);
		resolvedTargetSha = refSha;
		const warmPromise = timePhase({
			name: "warm parent",
			fn: () => getOrBuildWarmParent({ ref: args.ref, sha: refSha, signal }),
		});

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
			await sharedSetup;
			throw error;
		}

		milestone(
			`fan-out: provisioning ${effectiveWorkers} worker(s) from the warm snapshot`,
		);
		setPhase("fanout");
		setFanoutTotals(effectiveWorkers);
		const expectedNames = Array.from({ length: effectiveWorkers }, (_, idx) =>
			sandboxName(owner, runId, idx),
		);
		registerExpectedWorkers(expectedNames);
		const fanoutStart = Date.now();
		const provisionTasks: Promise<ProvisionedWorker>[] = [];
		for (let idx = 0; idx < effectiveWorkers; idx++) {
			const capabilities = workerCapabilities[idx] ?? [];
			const workerName = expectedNames[idx];
			provisionTasks.push(
				provisionWorker({
					idx,
					owner,
					runId,
					warmName,
					capabilities,
					ownerEmail,
					pooledAccounts: pooledAccountsPromise,
					ingress: ingressPromise,
					fanoutStart,
					signal,
				}).catch((error: unknown) => {
					const reason = error instanceof Error ? error.message : String(error);
					setWorkerStatus(workerName, "failed", reason.slice(0, 300));
					bumpWorkerFailed();
					throw error;
				}),
			);
		}
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

		const sandboxByName = new Map<string, ProviderSandbox>();
		for (const { handle, sandbox } of provisioned) {
			sandboxByName.set(handle.name, sandbox);
		}

		const resolveSandbox = (
			worker: WorkerHandle,
		): ProviderSandbox | undefined => sandboxByName.get(worker.name);
		const handlesFor = (capabilities: TestCapabilityId[]) =>
			provisioned
				.map(({ handle }) => handle)
				.filter(
					(handle) => handle.capabilities.join(",") === capabilities.join(","),
				);
		const runShards = [
			...capabilityShards.map(({ capabilities, files }) => ({
				label: capabilities.join("+"),
				files,
				handles: handlesFor(capabilities),
				slots: 1,
			})),
			{
				label: "normal",
				files: normalFiles,
				handles: handlesFor([]),
				slots: Math.max(1, args.perWorker),
			},
		];
		for (const { label, files, handles } of runShards) {
			if (files.length > 0 && handles.length === 0)
				throw new Error(
					`No ${label} workers provisioned; cannot run selected ${label} tests`,
				);
		}

		const pools = runShards.map(
			({ handles, slots }) => new WorkerPool(handles, slots),
		);
		const stopCulling = pools.map((pool) => startCulling(pool, resolveSandbox));
		markPhase("first test dispatched");
		milestone(
			"run: executing tests across both pools — live progress in the dashboard",
		);
		setPhase("run");
		const runPhaseStart = Date.now();
		try {
			await runShardTests({
				shards: [
					...runShards.map(({ files, handles, slots }, index) => ({
						files,
						executor: new RemoteExecutor({
							pool: pools[index],
							resolveSandbox,
							toWorkerPath: toSandboxPath,
						}),
						maxParallel: Math.max(1, handles.length * slots),
					})),
					{
						files: stripeConnectFiles,
						executor: stripeConnectUnavailable,
						maxParallel: 1,
					},
				],
			});
		} finally {
			for (const stop of stopCulling) stop();
			for (const pool of pools) pool.close();
		}

		lastRunWallMs = Date.now() - runPhaseStart;

		const runResults = Array.from(getTuiState().files.values());
		lastRunExitCode = runResults.some((file) => file.status === "failed")
			? 1
			: 0;

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
		const totalFilesFailed = runResults.filter(
			(file) => file.status === "failed",
		).length;
		let costLine: string | undefined;
		const publishSummary = (lifetimeMs: number): void => {
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
		publishSummary(Date.now() - fanoutStart);

		milestone(
			args.keep
				? "teardown: skipped (--keep) — clean up later with `bun tw kill`"
				: "teardown: releasing sandboxes + Stripe sub-accounts",
		);
		setPhase("teardown");
		await teardown({ runId, skip: args.keep });
		teardownDone = true;

		publishSummary(Date.now() - fanoutStart);
		setPhase("done");

		const failedFiles = runResults.filter(
			(file) => file.status === "failed" || Boolean(file.crashError),
		);
		const failureReport: string[] = [];
		for (const file of failedFiles) {
			failureReport.push(`\n✗ ${file.file}`);
			if (file.crashError) {
				// Bun stderr's first line is just the file header — keep enough lines
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
			} catch {}
		}

		if (tui) {
			await sleep(2500);
			tui.unmountTui();
			disableQuietMode();
		}
		log(
			totalFilesFailed > 0
				? `done — ${totalPassed} passed · ${totalFilesFailed} file(s) failed (${totalFailed} test assert(s) failed, ${totalCrashed} crashed) · ${formatWall(lastRunWallMs)}${costLine ? ` · ${costLine}` : ""}`
				: `done — ${totalPassed} passed, ${totalFailed} failed, ${totalCrashed} crashed · ${formatWall(lastRunWallMs)}${costLine ? ` · ${costLine}` : ""}`,
		);

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
		tui?.unmountTui();
		disableQuietMode();
		if (!(teardownDone || teardownStarted)) {
			await teardown({ runId, skip: args.keep }).catch((error) => {
				warn(`teardown after error failed: ${(error as Error).message}`);
			});
			await registry.markCancelled(runId).catch(() => {});
		}
	}

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

export const toSandboxPath = (localFile: string): string => {
	if (localFile.startsWith(`${PROJECT_ROOT}/`)) {
		return `${sandboxRepoRoot()}/${localFile.slice(PROJECT_ROOT.length + 1)}`;
	}
	return localFile;
};

let lastRunExitCode = 0;

let lastRunWallMs = 0;
let lastRunCost: CostEstimate | undefined;
export const getLastRunWallMs = (): number => lastRunWallMs;
export const getLastRunCost = (): CostEstimate | undefined => lastRunCost;

export const getLastRunExitCode = (): number => lastRunExitCode;
