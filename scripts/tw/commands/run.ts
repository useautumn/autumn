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

import { existsSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { deleteSvixApp as serverDeleteSvixApp } from "@server/external/svix/svixHelpers.js";
import chalk from "chalk";
import pLimit from "p-limit";
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
	REGISTRY_DIR,
	SERVER_PORT,
	SQS_QUEUE_URL_V2,
	TRACK_SQS_QUEUE_URL,
	TW_ENV,
	WARM_SANDBOX_PREFIX,
	WORKER_VCPUS,
} from "../constants.ts";
import {
	appendWorkerOutput,
	resetHub,
	setWorkerStatus,
} from "../dashboard/hub.ts";
import {
	type DashboardServer,
	startDashboardServer,
} from "../dashboard/server.ts";
import {
	type CostEstimate,
	estimateCost,
	formatCost,
	formatWall,
} from "../helpers/cost.ts";
import { createIngress, pushWorkerMapping } from "../helpers/ingress.ts";
import {
	disableQuietMode,
	enableQuietMode,
	narrate,
	setLogFile,
	sink,
	sinkLine,
} from "../helpers/logSink.ts";
import {
	getOwner,
	newRunId,
	sandboxName,
	vercelTags,
} from "../helpers/owner.ts";
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
	createSandboxSubAccount,
	deleteConnectWebhook,
	deleteSubAccount,
	registerConnectIngressWebhook,
	validateStripeKeyPool,
} from "../helpers/stripe.ts";
import {
	encodeSubAccount,
	keyIndexFromWebhookTag,
	stripeKeyByIndex,
	stripeKeyForWorker,
	stripeKeyPoolSize,
	webhookKeyTag,
} from "../helpers/stripeKeyPool.ts";
import {
	createSvixApp as orchestratorCreateSvixApp,
	partitionShards,
} from "../helpers/svix.ts";
import { runSwarmTests } from "../tui/runnerCore.ts";
import {
	bumpAccountDone,
	bumpSandboxDone,
	bumpStripeDone,
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
} from "../tui/store.ts";
import type { TwRunArgs, WorkerHandle } from "../types.ts";
import { READY_SENTINEL } from "../worker/boot.ts";

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
 * Git source for the warm parent's clone (repo @ ref). Mirrors spike.ts: the
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
	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	return token
		? { url, revision: ref, username: "x-access-token", password: token }
		: { url, revision: ref };
};
/** Path to the per-worker boot script, relative to the in-sandbox repo root. */
const BOOT_SCRIPT = "scripts/tw/worker/boot.ts";

/** Default owner email stamped on Stripe sub-accounts (contact_email). */
const OWNER_EMAIL_FALLBACK = "tw@autumn.test";

/**
 * Base64 edge-config override injected into every worker (`AUTUMN_EDGE_CONFIG_OVERRIDE_B64`).
 * The server's `createEdgeConfigStore` decodes this `{ [s3Key]: config }` map and
 * serves each store from memory instead of polling S3 (which has no creds in the
 * µVM). We force the `v2-cache` rollout to 100% so track/check use the atomic
 * cache-v2 (Dragonfly) path; every other edge config falls back to its safe
 * default (no S3 chatter). The key mirrors `ADMIN_ROLLOUT_CONFIG_KEY`
 * ("admin/rollout-config.json") on the server (inlined to avoid importing the AWS
 * SDK into the orchestrator).
 */
const EDGE_CONFIG_OVERRIDE_B64 = Buffer.from(
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

/** How long a single resource's teardown may take before we give up on it (§9a). */
const TEARDOWN_PER_RESOURCE_TIMEOUT_MS = 20_000;

/** Bounded concurrency for teardown deletes (serial was the long-pole at N=62). */
const TEARDOWN_STRIPE_CONCURRENCY = 16;
const TEARDOWN_SANDBOX_CONCURRENCY = 16;

/** How long to wait for a worker to print the READY sentinel after boot starts. */
const WORKER_READY_TIMEOUT_MS = 5 * 60 * 1000;

const SIGINT_EXIT_CODE = 130;

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const log = (message: string): void => {
	sinkLine(chalk.cyan(`[tw] ${message}`));
};

/**
 * Phase-boundary milestone — ALWAYS visible on the terminal (via `narrate`),
 * even during quiet mode when the firehose is routed to the run log + web
 * dashboard. Keeps the terminal from sitting silent for minutes during warm-up /
 * snapshot / fan-out. Use sparingly: lifecycle transitions, not the firehose.
 */
const milestone = (message: string): void => {
	narrate(chalk.cyan.bold(`[tw] ${message}`));
};

const warn = (message: string): void => {
	sinkLine(chalk.yellow(`[tw] ${message}`));
};

const errorLog = (message: string): void => {
	sinkLine(chalk.red(`[tw] ${message}`));
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
 * same-origin → one-click open. Skips if already built; best-effort (a failure
 * just means the WS server falls back to the dev-server URL).
 */
const ensureDashboardSpa = (): void => {
	const dir = join(PROJECT_ROOT, "apps", "testbench");
	if (existsSync(join(dir, "dist", "index.html"))) {
		return;
	}
	process.stdout.write("📊 building dashboard (first run, ~once)…\n");
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

/**
 * Recursively find the first file under `baseDir` whose path ends with
 * `/${pathSuffix}` (mirrors the dispatcher's `findFileByPath`). `_groups` file
 * paths are relative to the test ROOT (e.g. `billing/attach/...test.ts`) but the
 * files actually live under a sub-tree (`server/tests/integration/billing/...`),
 * so a plain `join(TESTS_DIR, groupPath)` misses them — we suffix-search instead.
 */
const findFileBySuffix = async (
	baseDir: string,
	pathSuffix: string,
): Promise<string | undefined> => {
	const normalizedSuffix = `/${pathSuffix}`;
	const walk = async (current: string): Promise<string | undefined> => {
		const entries = await readdir(current);
		for (const entry of entries) {
			const fullPath = join(current, entry);
			const entryStat = await stat(fullPath);
			if (entryStat.isDirectory()) {
				const found = await walk(fullPath);
				if (found) {
					return found;
				}
			} else if (fullPath.endsWith(normalizedSuffix)) {
				return fullPath;
			}
		}
		return undefined;
	};
	return walk(baseDir);
};

/**
 * Recursively find the first directory under `baseDir` whose path ends with
 * `/${pathSuffix}` (mirrors the dispatcher's `findFolderByPath`), for
 * directory-style `_groups` paths nested below the test root.
 */
const findFolderBySuffix = async (
	baseDir: string,
	pathSuffix: string,
): Promise<string | undefined> => {
	const normalizedSuffix = `/${pathSuffix}`;
	const walk = async (current: string): Promise<string | undefined> => {
		const entries = await readdir(current);
		for (const entry of entries) {
			const fullPath = join(current, entry);
			const entryStat = await stat(fullPath);
			if (entryStat.isDirectory()) {
				if (fullPath.endsWith(normalizedSuffix)) {
					return fullPath;
				}
				const found = await walk(fullPath);
				if (found) {
					return found;
				}
			}
		}
		return undefined;
	};
	return walk(baseDir);
};

/**
 * Resolve one `_groups` path to absolute test files. A path can be either a
 * single `.test.ts` FILE or a DIRECTORY, and it may sit at the exact
 * `server/tests/<groupPath>` location OR nested deeper (e.g. under
 * `server/tests/integration/`). Try the exact location first (cheap), then fall
 * back to a recursive suffix search — the same two-step the `bun t` dispatcher
 * uses, so file-list groups (whose paths are individual files) resolve too.
 */
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

	// Not at the exact location: suffix-search the test tree (mirrors the
	// dispatcher). Files resolve to themselves; directories are walked.
	if (groupPath.endsWith(".test.ts")) {
		const found = await findFileBySuffix(TESTS_DIR, groupPath);
		return found ? [found] : [];
	}
	const foundDir = await findFolderBySuffix(TESTS_DIR, groupPath);
	return foundDir ? collectTestFilesFromDir(foundDir) : [];
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
	stripeSecretKey,
	isSvixShard,
	svixAppId,
}: {
	stripeAccountId: string;
	/** This worker's pool key — MUST match the key its sub-account was created on. */
	stripeSecretKey: string;
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
		// per-worker Stripe (this worker's POOL key + the sub-account it binds; the
		// account was created on this same key, so they share one rate-limit bucket).
		STRIPE_SANDBOX_SECRET_KEY: stripeSecretKey,
		// The connect seeder calls getStripeWebhookSecret UNCONDITIONALLY (before the
		// skip-verify branch) and throws if it's unset; the ingress forwards without an
		// org_id query, so it falls to this env var. Skip-verify never uses the value,
		// so a dummy satisfies it (plan §6a) — otherwise the worker 500s every webhook.
		STRIPE_SANDBOX_WEBHOOK_SECRET: "whsec_tw_skipverify",
		STRIPE_ACCOUNT_ID: stripeAccountId,
		ORG_ID: TEST_ORG_CONFIG.id,
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
		// The µVM is isolated and has NO AWS creds, so the S3-backed edge configs
		// (rollout, cache-v2-ramp, redis-v2-cache, blue-green, …) can't be read —
		// they'd poll S3 every 1s and spam CredentialsProviderError, AND the
		// v2-cache rollout would resolve EMPTY, silently dropping the server to the
		// legacy non-atomic cache-v1 path (breaking concurrency assertions + 202s).
		// The base64 edge-config override makes every store serve from memory (no
		// S3) and forces the v2-cache rollout to 100% — the prod default for months.
		AUTUMN_EDGE_CONFIG_OVERRIDE_B64: EDGE_CONFIG_OVERRIDE_B64,
	};

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
		source: resolveGitSource(ref),
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
		["bash", WARMUP_SCRIPT, ref],
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
		/** When this worker's Stripe sub-account finished creating. */
		stripeMs: number;
		/** When this worker reached READY (fork + boot complete). */
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

/**
 * Provision one worker: fork from the warm snapshot, read its public URL,
 * orchestrator-create + RECORD the Stripe sub-account BEFORE the worker does
 * anything that can fail (§9a), then run the detached boot, wait READY, and push
 * the `{ accountId → workerUrl }` mapping to the shared ingress so the one Connect
 * webhook can route this worker's events to it (replaces the per-worker webhook).
 */
const provisionWorker = async ({
	idx,
	owner,
	runId,
	warmName,
	isSvixShard,
	svixAppId,
	ownerEmail,
	ingressUrl,
	ingressToken,
	fanoutStart,
	signal,
}: {
	idx: number;
	owner: string;
	runId: string;
	warmName: string;
	isSvixShard: boolean;
	svixAppId?: string;
	ownerEmail: string;
	ingressUrl: string;
	ingressToken: string;
	/** Epoch ms when the fan-out phase began, for per-worker provisioning timings. */
	fanoutStart: number;
	signal: AbortSignal;
}): Promise<ProvisionedWorker> => {
	const name = sandboxName(owner, runId, idx);
	const orgId = TEST_ORG_CONFIG.id;
	// This worker's Stripe pool key (round-robin). The sub-account is CREATED on
	// this key and the worker's server USES this key, so they share one platform
	// rate-limit bucket — sharding workers across keys multiplies the ceiling.
	const { key: stripeSecretKey, keyIndex } = stripeKeyForWorker(idx);

	// 1. Orchestrator-create + RECORD the sub-account before the worker exists, so
	//    a fork/boot failure can never orphan an untracked Stripe account (§9a). The
	//    key index is stored with the id so teardown deletes it under the right key.
	const accountId = await createSandboxSubAccount({
		orgName: `${TEST_ORG_CONFIG.name} (${name})`,
		ownerEmail,
		owner,
		runId,
		orgId,
		secretKey: stripeSecretKey,
	});
	await registry.addSubAccount(runId, encodeSubAccount(accountId, keyIndex));
	bumpStripeDone();
	const stripeMs = Date.now() - fanoutStart;

	// 2. Fork the worker with its per-worker env (fork does NOT copy env). The SDK
	//    forks from the warm parent's NAME (its current snapshot is the warm one).
	const sandbox = await forkWorker({
		sourceSandbox: warmName,
		name,
		env: buildWorkerEnv({
			stripeAccountId: accountId,
			stripeSecretKey,
			isSvixShard,
			svixAppId,
		}),
		tags: vercelTags(owner, runId),
		signal,
	});
	await registry.addSandbox(runId, { name: sandbox.name, id: sandbox.id });

	// 3. Resolve the public URL (the worker's connect-route target).
	const publicUrl = await getPublicUrl(sandbox, SERVER_PORT);

	// 4. Boot the worker (detached) and wait for READY.
	log(`worker ${name}: booting${isSvixShard ? " (svix shard)" : ""}`);
	await waitForReady({ sandbox, name, signal });
	log(`worker ${name}: READY`);
	bumpWorkerReady();
	const readyMs = Date.now() - fanoutStart;

	// 5. Push the `{ accountId → workerUrl }` mapping to the shared ingress so the
	//    one platform Connect webhook routes THIS sub-account's events here. Because
	//    the RUN phase only starts after all provisionTasks resolve, every mapping is
	//    in place before any test fires events — no race (replaces the per-worker
	//    Connect webhook + its 16-worker cap, §6a).
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

	return { handle, sandbox, timing: { stripeMs, readyMs } };
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
		`teardown: ${entry.subAccounts.length} sub-account(s), ${entry.webhooks.length} webhook(s), ${entry.sandboxes.length} sandbox(es)`,
	);

	// Delete sub-accounts CONCURRENTLY (bounded) — a 62-worker run has 62 accounts
	// and serial Stripe deletes are the teardown long-pole. Stripe tolerates this
	// fan-out; the limit just avoids hammering the API.
	setTeardownAccounts(0, entry.subAccounts.length);
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

	if (entry.svixAppId) {
		await timeBoxed(`delete svix app ${entry.svixAppId}`, () =>
			deleteSvixApp(entry.svixAppId as string),
		);
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

	log(`resolving test files for: ${args.groupsOrPatterns.join(" ") || "core"}`);
	const allFiles = await resolveTestFiles(args.groupsOrPatterns);
	if (allFiles.length === 0) {
		throw new Error("no test files resolved — nothing to run");
	}

	// Stripe key-pool preflight (only when a pool is configured): probe each key's
	// Connect/v2-accounts capability and DROP the dead ones up-front, so workers
	// aren't assigned to keys that can't create their sub-account (67/90 cryptic
	// mid-fan-out failures). Read-only + fast; runs before the expensive warm-up.
	if (stripeKeyPoolSize() > 1) {
		milestone(`validating ${stripeKeyPoolSize()} Stripe pool key(s)…`);
		const { usable, dropped } = await validateStripeKeyPool();
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

	// Svix/webhook tests are skipped for now: they need a Trigger.dev runner
	// (TRIGGER_SECRET_KEY) plus a browser (Kernel/Playwright) that aren't wired
	// into the swarm yet, so they would only ever fail. Drop them from the run and
	// surface the count. The remaining files run mixed into the pool with no
	// dedicated shard — no blocking, no --max>=2 requirement.
	if (svixFiles.length > 0) {
		warn(
			`skipping ${svixFiles.length} svix/webhook file(s) for now (Trigger + browser not wired into the swarm)`,
		);
	}
	if (normalFiles.length === 0) {
		throw new Error(
			"no runnable test files after skipping svix/webhook files — nothing to run",
		);
	}
	log(`running ${normalFiles.length} file(s) on the pool (svix skipped)`);

	// Pool sizing: never over-provision (plan §8.7). One worker covers ≥1 file.
	// No dedicated svix shard anymore, so the whole pool runs the normal files.
	const requestedWorkers = Math.max(1, args.workers);
	const effectiveWorkers = Math.min(requestedWorkers, normalFiles.length);
	const needsSvixShard = false;

	// No per-worker webhook cap: the swarm registers ONE shared platform Connect
	// webhook → the ingress sandbox, which routes each event to the owning worker by
	// `event.account` (§6a). This removes the old Stripe 16-webhook/account ceiling.
	const maxParallel = effectiveWorkers * Math.max(1, args.perWorker);

	log(
		`pool: ${effectiveWorkers} worker(s) (requested ${requestedWorkers}, files ${normalFiles.length}), maxParallel=${maxParallel}`,
	);

	await registry.createRun({ owner, runId, ref: args.ref });
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
		// ----- WARM-UP (cached per ref-sha) -----------------------------------
		const refSha = resolveRefSha(args.ref);
		const warmName = await getOrBuildWarmParent({
			ref: args.ref,
			sha: refSha,
			signal,
		});

		// ----- INGRESS --------------------------------------------------------
		// Stand up the ONE shared Connect webhook ingress before fanning out: a
		// lightweight sandbox running the ingress http server, plus the single
		// platform Connect webhook pointed at it. Workers push their
		// `{ accountId → workerUrl }` mapping to it as they come up; Stripe → the one
		// Connect webhook → ingress → the owning worker, routed by `event.account`.
		// Both are recorded so teardown drops them (the ingress sandbox via the
		// sandbox loop, the platform webhook explicitly — it is NOT cascade-deleted
		// by sub-account deletion). Replaces the per-worker webhook + its 16-cap (§6a).
		log("creating shared Connect webhook ingress");
		const ingress = await createIngress({
			owner,
			runId,
			ref: args.ref,
			signal,
		});
		await registry.addSandbox(runId, {
			name: ingress.sandbox.name,
			id: ingress.sandbox.id,
		});
		// One Connect webhook PER pool key actually in use (each platform key only
		// delivers events for the accounts it owns). The ingress routes every event
		// to the owning worker by `event.account` regardless of which key sent it.
		const usedKeys = Math.min(stripeKeyPoolSize(), effectiveWorkers);
		for (let keyIndex = 0; keyIndex < usedKeys; keyIndex++) {
			const webhookId = await registerConnectIngressWebhook(
				ingress.publicUrl,
				stripeKeyByIndex(keyIndex),
			);
			await registry.addWebhook(runId, {
				sandboxName: ingress.sandbox.name,
				accountId: webhookKeyTag(keyIndex),
				webhookId,
			});
		}
		log(
			`ingress ready (${ingress.publicUrl}), ${usedKeys} platform Connect webhook(s) registered across the key pool`,
		);

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

		milestone(
			`fan-out: provisioning ${effectiveWorkers} worker(s) from the warm snapshot`,
		);
		setPhase("fanout");
		setFanoutTotals(effectiveWorkers);
		const fanoutStart = Date.now();
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
					ingressUrl: ingress.publicUrl,
					ingressToken: ingress.token,
					fanoutStart,
					signal,
				}),
			);
		}
		// Wait for ALL provisionWorker tasks to SETTLE (not just bail on the first
		// rejection) so every sub-account/sandbox is recorded before teardown reads
		// the registry. Otherwise a peer still creating an account AFTER another's
		// failure leaks it — and the create/delete interleaving is ugly.
		const settled = await Promise.allSettled(provisionTasks);
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

		// Fan-out benchmark. All timings are ms from fan-out start. `stripeMs` is
		// when a worker's account finished; `readyMs` is when it hit READY (fork +
		// boot done). The fork→ready slice per worker is `readyMs - stripeMs`.
		const stat = (xs: number[]): { avg: number; min: number; max: number } => ({
			avg: xs.reduce((sum, x) => sum + x, 0) / Math.max(1, xs.length),
			min: Math.min(...xs),
			max: Math.max(...xs),
		});
		const stripe = stat(provisioned.map((p) => p.timing.stripeMs));
		const ready = stat(provisioned.map((p) => p.timing.readyMs));
		const forkBoot = stat(
			provisioned.map((p) => p.timing.readyMs - p.timing.stripeMs),
		);
		log(
			`fan-out benchmark (${provisioned.length} workers, ${WORKER_VCPUS} vCPU each):`,
		);
		log(
			`  · all Stripe accounts created in ${formatWall(stripe.max)} (last @ ${formatWall(stripe.max)})`,
		);
		log(`  · all workers READY in ${formatWall(ready.max)} from fan-out start`);
		log(
			`  · per-worker fork→boot→READY: avg ${formatWall(forkBoot.avg)}, min ${formatWall(forkBoot.min)}, max ${formatWall(forkBoot.max)}`,
		);

		// ----- RUN ------------------------------------------------------------
		const sandboxByName = new Map<string, ProviderSandbox>();
		for (const { handle, sandbox } of provisioned) {
			sandboxByName.set(handle.name, sandbox);
		}

		const svixShard = needsSvixShard
			? provisioned.find(({ handle }) => handle.isSvixShard)
			: undefined;
		// If the dedicated svix shard was the worker that failed to provision, its
		// files can't run — surface that loudly rather than silently dropping them.
		if (needsSvixShard && !svixShard && svixFiles.length > 0) {
			warn(
				`fan-out: the svix shard failed to provision — ${svixFiles.length} svix file(s) will be SKIPPED this run`,
			);
		}

		const resolveSandbox = (
			worker: WorkerHandle,
		): ProviderSandbox | undefined => sandboxByName.get(worker.name);

		// Drive the swarm TUI's RUN phase.
		milestone(
			"run: executing tests across the pool — live progress in the dashboard",
		);
		setPhase("run");

		// Wall-clock of the RUN phase — the correct parallel-aware test duration
		// (the per-file durations summed by the runner over-count by ~Nx).
		const runPhaseStart = Date.now();

		// Route svix files onto the svix shard, normal onto the rest. The routing
		// constraint is a build-time partition (plan §7): the svix files run on a
		// pool of exactly the one svix shard, the normal files on a pool of the
		// rest. When there's no svix shard, the whole pool runs the normal files.
		if (svixShard && svixFiles.length > 0) {
			log(`running ${svixFiles.length} svix file(s) on the dedicated shard`);
			const svixPool = new WorkerPool(
				[svixShard.handle],
				Math.max(1, args.perWorker),
			);
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
					`${normalFiles.length} normal file(s) remain but no normal workers are available (svix shard consumed the only worker) — pass --max>=2`,
				);
			}
			const normalPool = new WorkerPool(
				normalHandles,
				Math.max(1, args.perWorker),
			);
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

		lastRunWallMs = Date.now() - runPhaseStart;

		// Worst verdict → process exit code, from the swarm store's per-file results.
		const runResults = Array.from(getTuiState().files.values());
		lastRunExitCode = runResults.some((file) => file.status === "failed")
			? 1
			: 0;

		// ----- TEARDOWN -------------------------------------------------------
		milestone(
			args.keep
				? "teardown: skipped (--keep) — clean up later with `bun tw kill`"
				: "teardown: releasing sandboxes + Stripe sub-accounts",
		);
		setPhase("teardown");
		await teardown({ runId, skip: args.keep });
		teardownDone = true;

		// ----- SUMMARY --------------------------------------------------------
		// Cost ESTIMATE (the SDK doesn't expose usage for running sandboxes, see
		// cost.ts): workers + the ingress, each at WORKER_VCPUS, alive from fan-out
		// start until teardown finished, against the Pro rate card.
		lastRunCost = estimateCost({
			workers: provisioned.length + 1,
			vcpus: WORKER_VCPUS,
			lifetimeMs: Date.now() - fanoutStart,
		});
		const costLine =
			lastRunCost.totalUsd > 0 ? formatCost(lastRunCost) : undefined;
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
		setSummary({
			passed: totalPassed,
			failed: totalFailed,
			crashed: totalCrashed,
			wallMs: lastRunWallMs,
			costLine,
			logFile: runLogFile,
		});
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
				failureReport.push(`    CRASH: ${file.crashError.split("\n")[0]}`);
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
			`done — ${totalPassed} passed, ${totalFailed} failed, ${totalCrashed} crashed · ${formatWall(lastRunWallMs)}${costLine ? ` · ${costLine}` : ""}`,
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

/**
 * Run a file set through the headless swarm runner (`runSwarmTests`), which drives
 * the opentui store. The pLimit window + two-phase retry + worker-death reschedule
 * live in `tui/runnerCore.ts`; this is a thin await. `bun t` keeps its own Ink
 * runner (`runTestsV2.tsx`) — the swarm no longer touches it.
 */
const runFiles = async (
	files: string[],
	executor: TestExecutor,
	opts: { maxParallel: number },
): Promise<void> => {
	if (files.length === 0) {
		return;
	}
	await runSwarmTests(files, executor, { maxParallel: opts.maxParallel });
};

/** Propagate the worst test verdict to the process exit code (set in `index.ts`). */
export const getLastRunExitCode = (): number => lastRunExitCode;
