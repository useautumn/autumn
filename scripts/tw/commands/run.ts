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

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { deleteSvixApp as serverDeleteSvixApp } from "@server/external/svix/svixHelpers.js";
import type { Sandbox } from "@vercel/sandbox";
import chalk from "chalk";
import {
	getGroup,
	resolveSuite,
	resolveTestPaths,
} from "../../../server/tests/_groups/index.ts";
import { TEST_ORG_CONFIG } from "../../setupTestUtils/createTestOrg.ts";
import type { TestExecutor } from "../../testScripts/testExecutor.ts";
import {
	DATABASE_CRITICAL_URL,
	DATABASE_URL,
	PROJECT_ROOT,
	REDIS_URL,
	SERVER_PORT,
	SQS_QUEUE_URL_V2,
	TRACK_SQS_QUEUE_URL,
	TW_ENV,
} from "../constants.ts";
import {
	getOwner,
	newRunId,
	sandboxName,
	vercelTags,
} from "../helpers/owner.ts";
import { WorkerPool } from "../helpers/pool.ts";
import * as registry from "../helpers/registry.ts";
import { RemoteExecutor } from "../helpers/remoteExecutor.ts";
import {
	createSandboxSubAccount,
	deleteSubAccount,
	registerSubAccountWebhook,
} from "../helpers/stripe.ts";
import {
	createSvixApp as orchestratorCreateSvixApp,
	partitionShards,
} from "../helpers/svix.ts";
import {
	createWarmSandbox,
	deleteSandbox,
	forkWorker,
	getPublicUrl,
	runStreaming,
	snapshotAndStop,
} from "../helpers/vercel.ts";
import type { TwRunArgs, WorkerHandle } from "../types.ts";
import { READY_SENTINEL } from "../worker/boot.ts";

/**
 * The repo root INSIDE the µVM. Vercel Sandbox sessions default their cwd to
 * `/vercel/sandbox`, where the base snapshot's repo checkout lives; the image
 * scripts (`warmup.sh`, `start-services.sh`) resolve their own root relative to
 * their location, but `boot.ts` reads `process.cwd()`, so detached boot must run
 * from here. Overridable via env for local iteration on a real sandbox.
 */
const SANDBOX_REPO_ROOT = process.env.TW_SANDBOX_REPO_ROOT ?? "/vercel/sandbox";

/** Path to the warm-up image script, relative to the in-sandbox repo root. */
const WARMUP_SCRIPT = "scripts/tw/image/warmup.sh";
/** Path to the per-worker boot script, relative to the in-sandbox repo root. */
const BOOT_SCRIPT = "scripts/tw/worker/boot.ts";

/** Default owner email stamped on Stripe sub-accounts (contact_email). */
const OWNER_EMAIL_FALLBACK = "tw@autumn.test";

/** How long a single resource's teardown may take before we give up on it (§9a). */
const TEARDOWN_PER_RESOURCE_TIMEOUT_MS = 20_000;

/** How long to wait for a worker to print the READY sentinel after boot starts. */
const WORKER_READY_TIMEOUT_MS = 5 * 60 * 1000;

const SIGINT_EXIT_CODE = 130;

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const log = (message: string): void => {
	console.log(chalk.cyan(`[tw] ${message}`));
};

const warn = (message: string): void => {
	console.warn(chalk.yellow(`[tw] ${message}`));
};

const errorLog = (message: string): void => {
	console.error(chalk.red(`[tw] ${message}`));
};

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

/** Recursively collect `*.test.ts` files under a directory (mirrors the dispatcher). */
const collectTestFilesFromDir = async (dir: string): Promise<string[]> => {
	const files: string[] = [];
	const walk = async (current: string): Promise<void> => {
		const entries = await readdir(current);
		for (const entry of entries) {
			const fullPath = join(current, entry);
			const entryStat = await stat(fullPath);
			if (entryStat.isDirectory()) {
				await walk(fullPath);
			} else if (entry.endsWith(".test.ts")) {
				files.push(fullPath);
			}
		}
	};
	await walk(dir);
	return files;
};

/** Resolve one `_groups` path (relative to `server/tests/`) to absolute test files. */
const resolveGroupPath = async (groupPath: string): Promise<string[]> => {
	const exactPath = join(TESTS_DIR, groupPath);
	try {
		const entryStat = await stat(exactPath);
		if (entryStat.isFile() && groupPath.endsWith(".test.ts")) {
			return [exactPath];
		}
		if (entryStat.isDirectory()) {
			return collectTestFilesFromDir(exactPath);
		}
	} catch {
		// Falls through — the path doesn't exist at the exact location.
	}
	return [];
};

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

	for (const arg of args) {
		const groupPaths = resolveTestPaths({ name: arg });
		if (groupPaths) {
			const matchedGroup = getGroup({ name: arg });
			const suiteGroups = resolveSuite({ name: arg });
			const label = matchedGroup ? "group" : suiteGroups ? "suite" : "paths";
			log(`matched ${label} "${arg}" (${groupPaths.length} path(s))`);
			for (const groupPath of groupPaths) {
				for (const file of await resolveGroupPath(groupPath)) {
					files.add(file);
				}
			}
			continue;
		}

		// Not a known group/suite — treat the arg itself as a server/tests path.
		const resolved = await resolveGroupPath(arg);
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
const buildWorkerEnv = ({
	stripeAccountId,
	isSvixShard,
	svixAppId,
}: {
	stripeAccountId: string;
	isSvixShard: boolean;
	svixAppId?: string;
}): Record<string, string> => {
	const env: Record<string, string> = {
		NODE_ENV: "development",
		SERVER_PORT: String(SERVER_PORT),
		// localhost service URLs (the µVM's own daemons).
		DATABASE_URL,
		DATABASE_CRITICAL_URL,
		BETTER_AUTH_URL: `http://localhost:${SERVER_PORT}`,
		REDIS_URL,
		CACHE_URL: REDIS_URL,
		CACHE_V2_DRAGONFLY_URL: REDIS_URL,
		SQS_QUEUE_URL_V2,
		TRACK_SQS_QUEUE_URL,
		// baked secrets (every worker).
		ENCRYPTION_IV: requireSecret("ENCRYPTION_IV"),
		ENCRYPTION_PASSWORD: requireSecret("ENCRYPTION_PASSWORD"),
		BETTER_AUTH_SECRET: requireSecret("BETTER_AUTH_SECRET"),
		STRIPE_WEBHOOK_SKIP_VERIFY: "true",
		// per-worker Stripe (platform key + the sub-account this worker binds).
		STRIPE_SANDBOX_SECRET_KEY: requireSecret("STRIPE_SANDBOX_SECRET_KEY"),
		STRIPE_ACCOUNT_ID: stripeAccountId,
		ORG_ID: TEST_ORG_CONFIG.id,
		// keep the DB CLI / preload paths off Infisical inside the µVM.
		AUTUMN_DB_DIRECT: "1",
	};

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
	CACHE_URL: REDIS_URL,
	CACHE_V2_DRAGONFLY_URL: REDIS_URL,
	SQS_QUEUE_URL_V2,
	TRACK_SQS_QUEUE_URL,
	AUTUMN_DB_DIRECT: "1",
	TW_WORKER_MODE: "1",
	TW_SKIP_STRIPE_ACCOUNT: "1",
	ENCRYPTION_IV: requireSecret("ENCRYPTION_IV"),
	ENCRYPTION_PASSWORD: requireSecret("ENCRYPTION_PASSWORD"),
	BETTER_AUTH_SECRET: requireSecret("BETTER_AUTH_SECRET"),
	BETTER_AUTH_URL: `http://localhost:${SERVER_PORT}`,
});

const warmUp = async ({
	owner,
	runId,
	ref,
	signal,
}: {
	owner: string;
	runId: string;
	ref: string;
	signal: AbortSignal;
}): Promise<WarmUpResult> => {
	const name = `${sandboxName(owner, runId, 0)}-warm`;
	log(`warm-up: creating warm parent ${name} (ref=${ref})`);

	const warm = await createWarmSandbox({
		name,
		tags: vercelTags(owner, runId),
		env: buildWarmEnv(),
		signal,
	});
	await registry.addSandbox(runId, { name: warm.name });

	log("warm-up: running warmup.sh (checkout → install → migrate → seed)");
	const { exitCode } = await runStreaming(
		warm,
		["bash", WARMUP_SCRIPT, ref],
		(text) => process.stdout.write(text),
		{ signal },
	);
	if (exitCode !== 0) {
		// FAIL FAST: a bad migration (or any warm-up step) aborts before any worker
		// is forked — the "don't get wrecked ×1000" property (plan §4b step 3).
		await timeBoxed(`delete warm parent ${warm.name}`, () =>
			deleteSandbox(warm),
		);
		throw new Error(
			`warm-up failed (warmup.sh exited ${exitCode}) — aborting, no workers forked`,
		);
	}

	log("warm-up: snapshotting warm parent");
	const warmSnapshotId = await snapshotAndStop(warm, { signal });
	log(`warm-up: warm snapshot ready (${warmSnapshotId})`);

	return { warmSnapshotId };
};

// ============================================================================
// Phase 3 — fan-out + per-worker boot
// ============================================================================

type ProvisionedWorker = {
	handle: WorkerHandle;
	sandbox: Sandbox;
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
	sandbox: Sandbox;
	name: string;
	signal: AbortSignal;
}): Promise<void> => {
	let ready = false;
	let resolveReady: () => void = () => {
		// replaced below
	};
	const readyPromise = new Promise<void>((resolve) => {
		resolveReady = resolve;
	});

	const sink = new Writable({
		write(chunk, _encoding, callback) {
			const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			process.stdout.write(chalk.gray(`[${name}] ${text}`));
			if (!ready && text.includes(READY_SENTINEL)) {
				ready = true;
				resolveReady();
			}
			callback();
		},
	});

	// Detached: the boot command (services + the long-lived server) must keep
	// running for the whole test run, so we don't await its completion here.
	const command = await sandbox.runCommand({
		cmd: "bun",
		args: [BOOT_SCRIPT],
		cwd: SANDBOX_REPO_ROOT,
		detached: true,
		stdout: sink,
		stderr: sink,
		signal,
	});

	const exitedFirst = command.wait({ signal }).then((finished) => {
		if (!ready) {
			throw new Error(
				`worker ${name} boot exited (code ${finished.exitCode}) before READY`,
			);
		}
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

/**
 * Provision one worker: fork from the warm snapshot, read its public URL,
 * orchestrator-create + RECORD the Stripe sub-account + webhook BEFORE the worker
 * does anything that can fail (§9a), then run the detached boot and wait READY.
 */
const provisionWorker = async ({
	idx,
	owner,
	runId,
	warmName,
	isSvixShard,
	svixAppId,
	ownerEmail,
	signal,
}: {
	idx: number;
	owner: string;
	runId: string;
	warmName: string;
	isSvixShard: boolean;
	svixAppId?: string;
	ownerEmail: string;
	signal: AbortSignal;
}): Promise<ProvisionedWorker> => {
	const name = sandboxName(owner, runId, idx);
	const orgId = TEST_ORG_CONFIG.id;

	// 1. Orchestrator-create + RECORD the sub-account before the worker exists, so
	//    a fork/boot failure can never orphan an untracked Stripe account (§9a).
	const accountId = await createSandboxSubAccount({
		orgName: `${TEST_ORG_CONFIG.name} (${name})`,
		ownerEmail,
		owner,
		runId,
		orgId,
	});
	await registry.addSubAccount(runId, accountId);

	// 2. Fork the worker with its per-worker env (fork does NOT copy env). The SDK
	//    forks from the warm parent's NAME (its current snapshot is the warm one).
	const sandbox = await forkWorker({
		sourceSandbox: warmName,
		name,
		env: buildWorkerEnv({ stripeAccountId: accountId, isSvixShard, svixAppId }),
		tags: vercelTags(owner, runId),
		signal,
	});
	await registry.addSandbox(runId, { name: sandbox.name });

	// 3. Resolve the public URL (the inbound Stripe webhook target) and register
	//    the webhook ON the sub-account, recording it before boot proceeds (§9a).
	const publicUrl = getPublicUrl(sandbox, SERVER_PORT);
	const webhookId = await registerSubAccountWebhook({
		accountId,
		publicUrl,
		orgId,
	});
	await registry.addWebhook(runId, {
		sandboxName: sandbox.name,
		accountId,
		webhookId,
	});

	// 4. Boot the worker (detached) and wait for READY.
	log(`worker ${name}: booting${isSvixShard ? " (svix shard)" : ""}`);
	await waitForReady({ sandbox, name, signal });
	log(`worker ${name}: READY`);

	const handle: WorkerHandle = {
		name,
		sandboxId: sandbox.name,
		publicUrl,
		accountId,
		isSvixShard,
		busy: false,
	};

	return { handle, sandbox };
};

// ============================================================================
// Teardown (§9a — idempotent, orchestrator-driven from the registry)
// ============================================================================

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
		`teardown: ${entry.subAccounts.length} sub-account(s), ${entry.sandboxes.length} sandbox(es)`,
	);

	for (const accountId of entry.subAccounts) {
		await timeBoxed(`delete sub-account ${accountId}`, () =>
			deleteSubAccount(accountId),
		);
	}

	if (entry.svixAppId) {
		await timeBoxed(`delete svix app ${entry.svixAppId}`, () =>
			deleteSvixApp(entry.svixAppId as string),
		);
	}

	for (const sandbox of entry.sandboxes) {
		await timeBoxed(`delete sandbox ${sandbox.name}`, () =>
			deleteSandbox(sandbox.name),
		);
	}

	await registry.markCompleted(runId);
	log("teardown complete");
};

// ============================================================================
// Main run
// ============================================================================

export const run = async (args: TwRunArgs): Promise<void> => {
	const owner = getOwner();
	const runId = newRunId();
	const ownerEmail = process.env.TW_OWNER_EMAIL ?? OWNER_EMAIL_FALLBACK;

	log(`resolving test files for: ${args.groupsOrPatterns.join(" ") || "core"}`);
	const allFiles = await resolveTestFiles(args.groupsOrPatterns);
	if (allFiles.length === 0) {
		throw new Error("no test files resolved — nothing to run");
	}

	const { svixFiles, normalFiles } = await partitionShards(allFiles);
	log(
		`${allFiles.length} file(s): ${normalFiles.length} normal, ${svixFiles.length} svix`,
	);

	// Pool sizing: never over-provision (plan §8.7). One worker covers ≥1 file.
	// When svix files exist, one worker MUST be the dedicated svix shard.
	const requestedWorkers = Math.max(1, args.workers);
	let effectiveWorkers = Math.min(requestedWorkers, allFiles.length);
	const needsSvixShard = svixFiles.length > 0;

	// When there are BOTH svix and normal files, worker 0 becomes the dedicated
	// svix shard and is filtered out of the normal pool. With only one worker the
	// normal pool would be EMPTY while normal files remain — `pool.acquire()` would
	// park forever and hang the whole run. Require (and, where possible, bump to)
	// at least two workers so the normal pool is never empty (plan §7/§8.7).
	if (needsSvixShard && normalFiles.length > 0) {
		const MIN_WORKERS_FOR_MIXED_RUN = 2;
		if (allFiles.length < MIN_WORKERS_FOR_MIXED_RUN) {
			// Can't happen with ≥1 svix + ≥1 normal file, but keep the invariant explicit.
			throw new Error(
				"a mixed svix+normal run needs at least 2 test files (1 svix shard + 1 normal worker)",
			);
		}
		if (requestedWorkers < MIN_WORKERS_FOR_MIXED_RUN) {
			throw new Error(
				`this run has both svix and normal test files, so it needs a dedicated svix shard plus at least one normal worker — pass --workers>=${MIN_WORKERS_FOR_MIXED_RUN} (got ${requestedWorkers})`,
			);
		}
		effectiveWorkers = Math.max(effectiveWorkers, MIN_WORKERS_FOR_MIXED_RUN);
	}

	const maxParallel = effectiveWorkers * Math.max(1, args.perWorker);

	log(
		`pool: ${effectiveWorkers} worker(s) (requested ${requestedWorkers}, files ${allFiles.length}), maxParallel=${maxParallel}`,
	);

	await registry.createRun({ owner, runId, ref: args.ref });
	log(`run ${runId} (owner=${owner}, ref=${args.ref}, env=${TW_ENV})`);

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
		// ----- WARM-UP --------------------------------------------------------
		await warmUp({
			owner,
			runId,
			ref: args.ref,
			signal,
		});
		const warmName = `${sandboxName(owner, runId, 0)}-warm`;

		// ----- FAN-OUT --------------------------------------------------------
		// Worker 0 is the dedicated svix shard when svix files exist (plan §7).
		// The orchestrator creates + RECORDS the one svix app BEFORE that worker
		// boots, so a fork/boot failure can never orphan an untracked Svix app
		// (§9a); the worker only binds the recorded id into svix_config.
		let svixAppId: string | undefined;
		if (needsSvixShard) {
			log("creating dedicated svix shard app (orchestrator-driven, §9a)");
			svixAppId = await orchestratorCreateSvixApp(TEST_ORG_CONFIG.id);
			await registry.setSvixApp(runId, svixAppId);
			log(`svix app ${svixAppId} created and recorded`);
		}

		log(`fanning out ${effectiveWorkers} worker(s) from the warm snapshot`);
		const provisionTasks: Promise<ProvisionedWorker>[] = [];
		for (let idx = 0; idx < effectiveWorkers; idx++) {
			const isSvixShard = needsSvixShard && idx === 0;
			provisionTasks.push(
				provisionWorker({
					idx,
					owner,
					runId,
					warmName,
					isSvixShard,
					svixAppId: isSvixShard ? svixAppId : undefined,
					ownerEmail,
					signal,
				}),
			);
		}
		const provisioned = await Promise.all(provisionTasks);

		// ----- RUN ------------------------------------------------------------
		const sandboxByName = new Map<string, Sandbox>();
		for (const { handle, sandbox } of provisioned) {
			sandboxByName.set(handle.name, sandbox);
		}

		const svixShard = needsSvixShard
			? provisioned.find(({ handle }) => handle.isSvixShard)
			: undefined;

		const resolveSandbox = (worker: WorkerHandle): Sandbox | undefined =>
			sandboxByName.get(worker.name);

		// Route svix files onto the svix shard, normal onto the rest. The routing
		// constraint is a build-time partition (plan §7): the svix files run on a
		// pool of exactly the one svix shard, the normal files on a pool of the
		// rest. When there's no svix shard, the whole pool runs the normal files.
		if (svixShard && svixFiles.length > 0) {
			log(`running ${svixFiles.length} svix file(s) on the dedicated shard`);
			const svixPool = new WorkerPool([svixShard.handle]);
			const svixExecutor = new RemoteExecutor({
				pool: svixPool,
				resolveSandbox,
				toWorkerPath: toSandboxPath,
			});
			await runFiles(svixFiles, svixExecutor, {
				maxParallel: Math.max(1, args.perWorker),
			});
			svixPool.close();
		}

		if (normalFiles.length > 0) {
			log(`running ${normalFiles.length} normal file(s) on the pool`);
			const normalHandles = provisioned
				.filter(({ handle }) => !(svixShard && handle.isSvixShard))
				.map(({ handle }) => handle);
			// Never construct a WorkerPool([]) while files remain: an empty pool's
			// `acquire()` parks forever and hangs the run. The worker-count guard
			// above should make this unreachable, but fail loud rather than hang.
			if (normalHandles.length === 0) {
				throw new Error(
					`${normalFiles.length} normal file(s) remain but no normal workers are available (svix shard consumed the only worker) — pass --workers>=2`,
				);
			}
			const normalPool = new WorkerPool(normalHandles);
			const normalExecutor = new RemoteExecutor({
				pool: normalPool,
				resolveSandbox,
				toWorkerPath: toSandboxPath,
			});
			const normalParallel = Math.max(
				1,
				normalHandles.length * Math.max(1, args.perWorker),
			);
			await runFiles(normalFiles, normalExecutor, {
				maxParallel: normalParallel,
			});
			normalPool.close();
		}

		// ----- TEARDOWN -------------------------------------------------------
		await teardown({ runId, skip: args.keep });
		teardownDone = true;
	} finally {
		process.off("SIGINT", sigintHandler);
		process.off("SIGTERM", sigtermHandler);
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
};

/**
 * Translate an absolute LOCAL test path into the worker-relative path the
 * sandbox checked the repo out at (plan §8.5 "Paths"). Both roots share the
 * `server/tests/...` suffix, so we rebase off the local PROJECT_ROOT onto the
 * in-sandbox repo root.
 */
const toSandboxPath = (localFile: string): string => {
	if (localFile.startsWith(`${PROJECT_ROOT}/`)) {
		return `${SANDBOX_REPO_ROOT}/${localFile.slice(PROJECT_ROOT.length + 1)}`;
	}
	return localFile;
};

/**
 * Hand a file set to the UNCHANGED sliding-window runner (`runWithExecutor`) and
 * resolve when it finishes — keeping the runner's `pLimit` window, parser, retry
 * phase and Ink TUI exactly as-is (plan §8).
 *
 * The runner is a self-contained CLI: on completion it calls `process.exit(code)`
 * inside the Ink app (`runTestsV2.tsx`). As an orchestrator we must run teardown
 * AFTER the tests finish, so we cannot let it terminate the process. We can't
 * modify the runner (it is owned by the runner-refactor step), so we intercept
 * `process.exit` for the duration of this phase: the runner's exit call is
 * captured as the run's pass/fail verdict and resolves this promise instead of
 * killing the process; `process.exit` is restored before we return so later
 * phases (teardown) behave normally. The captured non-zero code is preserved on
 * `process.exitCode` so the overall `bun tw` still exits non-zero on failures.
 */
let lastRunExitCode = 0;

/**
 * The runner lives in a `.tsx` (JSX) module; the scripts tsconfig's `include`
 * compiles only `.ts` files (not `.tsx`), so we resolve `runWithExecutor` via a
 * typed dynamic import — Bun handles the JSX at runtime, and the orchestrator
 * never type-checks the JSX module. The signature mirrors the runner's export.
 */
type RunWithExecutor = (
	testFiles: string[],
	executor: TestExecutor,
	opts: { maxParallel: number; verbose?: boolean },
) => void;

const runFiles = async (
	files: string[],
	executor: TestExecutor,
	opts: { maxParallel: number },
): Promise<void> => {
	if (files.length === 0) {
		return;
	}

	// Non-literal specifier: keeps the typechecker from pulling the JSX module
	// into this (`.ts`-only) program (`--jsx` is not set here), while Bun still
	// resolves it relative to this file at runtime.
	const runnerSpecifier = "../../testScripts/runTestsV2.tsx";
	const runnerModule = (await import(runnerSpecifier)) as {
		runWithExecutor: RunWithExecutor;
	};
	const { runWithExecutor } = runnerModule;

	await new Promise<void>((resolve) => {
		const realExit = process.exit.bind(process);
		let restored = false;
		const restore = (): void => {
			if (!restored) {
				restored = true;
				process.exit = realExit;
			}
		};

		// Capture the runner's intended exit instead of terminating: the runner is
		// a self-contained CLI that calls `process.exit(code)` on completion, but
		// the orchestrator must run teardown AFTER the tests finish. We can't modify
		// the runner, so we intercept `process.exit` for the duration of this phase
		// — its exit call resolves this promise (and is recorded as the verdict) —
		// then restore `process.exit` so teardown behaves normally.
		(process as unknown as { exit: (code?: number) => never }).exit = ((
			code?: number,
		): never => {
			if (typeof code === "number" && code !== 0) {
				lastRunExitCode = code;
			}
			restore();
			resolve();
			return undefined as never;
		}) as typeof process.exit;

		try {
			runWithExecutor(files, executor, { maxParallel: opts.maxParallel });
		} catch (error) {
			restore();
			warn(`runner threw during render: ${(error as Error).message}`);
			resolve();
		}
	});
};

/** Propagate the worst test verdict to the process exit code (set in `index.ts`). */
export const getLastRunExitCode = (): number => lastRunExitCode;
