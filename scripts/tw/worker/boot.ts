#!/usr/bin/env bun

/**
 * In-sandbox per-worker bring-up (plan §4c, §5, §6a, §9, §9a, §11a).
 *
 * Runs INSIDE a Vercel sandbox forked from the warm snapshot. The warm snapshot
 * already baked: deps, the migrated DB, the seeded unit-test-org (no Stripe), and
 * the clean-stopped native service data dirs. This script makes the worker
 * RUNNABLE, then prints a READY sentinel the orchestrator waits for. It does NOT
 * start the test run — the orchestrator drives `bun test <file>` via runCommand
 * after READY (plan §8.2).
 *
 * Sequence:
 *   1. Start native services (PG18 + Dragonfly + elasticmq-native) via the image
 *      start script (`scripts/tw/image/start-services.sh`), resolved against the
 *      in-sandbox repo root (process.cwd()).
 *   2. Wait for PG / Dragonfly / elasticmq TCP health.
 *   3. (if NEEDS_SVIX) bind the orchestrator-created Svix app into svix_config (plan §7/§9a).
 *   4. Bind the Stripe sub-account into the localhost DB (plan §6a step 2 / §9a).
 *   5. Start the Autumn server (dev single-process path, NODE_ENV=development)
 *      listening on SERVER_PORT.
 *   6. Wait for the server health endpoint (`GET /`, 200 when ready).
 *   7. Print `TW_WORKER_READY` to stdout.
 *
 * Fails loud: any service that doesn't come up within its budget throws with a
 * clear message and a non-zero exit so the orchestrator can evict + replace the
 * worker (plan §8.4).
 *
 * Inputs (env, injected at fork by the orchestrator — see plan §11a):
 *   - ORG_ID            (hardcoded unit-test-org id; defaults to TEST_ORG_CONFIG.id)
 *   - STRIPE_ACCOUNT_ID (the `acct_*` the orchestrator minted + recorded; §9a)
 *   - NEEDS_SVIX        (set/truthy on the single dedicated Svix shard; §7)
 *   - SVIX_API_KEY      (only present on the Svix shard; §7/§11a)
 *   - SVIX_APP_ID       (orchestrator-created Svix app id; only on the Svix shard; §9a)
 *   - SERVER_PORT       (the only exposed port; defaults to constants.SERVER_PORT)
 *   - plus the baked/localhost service env from §11a.
 */

import { existsSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { type Subprocess, spawn } from "bun";
import chalk from "chalk";
import {
	DRAGONFLY_PORT,
	ELASTICMQ_PORT,
	PG_PORT,
	SERVER_PORT,
	TINYBIRD_LOCAL_URL,
	TW_ENV,
} from "../constants.js";

/** The READY sentinel the orchestrator scans stdout for. Plan §9 step 5. */
export const READY_SENTINEL = "TW_WORKER_READY";

const SERVICE_HEALTH_TIMEOUT_MS = 60_000;
const SERVER_HEALTH_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const TCP_CONNECT_TIMEOUT_MS = 1_000;

const log = (message: string): void => {
	console.log(chalk.cyan(`[tw-boot] ${message}`));
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const resolveServerPort = (): number => {
	const fromEnv = process.env.SERVER_PORT;
	if (fromEnv && fromEnv.length > 0) {
		const parsed = Number.parseInt(fromEnv, 10);
		if (!Number.isNaN(parsed)) {
			return parsed;
		}
	}
	return SERVER_PORT;
};

const isTruthyEnv = (value: string | undefined): boolean =>
	value !== undefined && value !== "" && value !== "0" && value !== "false";

/** Resolves true if a TCP connection to localhost:<port> succeeds. */
const tcpProbe = (port: number): Promise<boolean> =>
	new Promise((resolve) => {
		const socket = connect({ host: "127.0.0.1", port });
		let settled = false;
		const finish = (ok: boolean): void => {
			if (settled) {
				return;
			}
			settled = true;
			socket.destroy();
			resolve(ok);
		};
		socket.setTimeout(TCP_CONNECT_TIMEOUT_MS);
		socket.once("connect", () => finish(true));
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
	});

const waitForTcpPort = async (
	label: string,
	port: number,
	timeoutMs: number,
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await tcpProbe(port)) {
			log(`${label} is up on :${port}`);
			return;
		}
		await sleep(POLL_INTERVAL_MS);
	}
	throw new Error(
		`[tw-boot] ${label} did not come up on localhost:${port} within ${timeoutMs}ms — aborting worker boot`,
	);
};

/** Waits for the Autumn server health endpoint (`GET /`) to return 200. */
const waitForServerHealth = async (
	port: number,
	timeoutMs: number,
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	const url = `http://127.0.0.1:${port}/`;
	let lastStatus: number | string = "no-response";
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
			if (response.ok) {
				log(`server health OK on :${port}`);
				return;
			}
			lastStatus = response.status;
		} catch (error) {
			lastStatus = (error as Error).name ?? "fetch-error";
		}
		await sleep(POLL_INTERVAL_MS);
	}
	throw new Error(
		`[tw-boot] server health (${url}) not ready within ${timeoutMs}ms (last status: ${lastStatus}) — aborting worker boot`,
	);
};

/**
 * Spawns the image start script that brings up the native services. The script
 * lives in the image layer (`scripts/tw/image/start-services.sh`) and is resolved
 * against the in-sandbox repo root. Throws loudly if it exits non-zero.
 */
const startNativeServices = async (repoRoot: string): Promise<void> => {
	const startScript = join(
		repoRoot,
		"scripts",
		"tw",
		"image",
		"start-services.sh",
	);
	log(`starting native services via ${startScript}`);
	const proc = spawn(["bash", startScript], {
		cwd: repoRoot,
		stdout: "inherit",
		stderr: "inherit",
		env: process.env as Record<string, string>,
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		throw new Error(
			`[tw-boot] start-services.sh exited with code ${exitCode} — services failed to start`,
		);
	}
};

/** Tinybird Local ships on the Modal base image at this path; absent on Vercel. */
const TINYBIRD_MARKER = "/app/tinybird-local";

/**
 * Waits for Tinybird Local's /tokens endpoint (200 only once the whole stack
 * serves), then injects the workspace admin token + local API URL into
 * process.env so the server/workers/cron children inherit them. The token was
 * minted at warm time and persists in the snapshot's Redis, so every fork
 * resolves the same value.
 */
const wireTinybirdEnv = async (timeoutMs: number): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	const url = `${TINYBIRD_LOCAL_URL}/tokens`;
	let lastError = "no-response";
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
			if (response.ok) {
				const tokens = (await response.json()) as {
					workspace_admin_token?: string;
				};
				if (!tokens.workspace_admin_token) {
					throw new Error("no workspace_admin_token in /tokens response");
				}
				// /tokens goes 200 before the API backend serves — also require an
				// authenticated 200 from the real API before wiring env.
				const apiProbe = await fetch(
					`${TINYBIRD_LOCAL_URL}/v0/datasources?token=${tokens.workspace_admin_token}`,
					{ signal: AbortSignal.timeout(2_000) },
				);
				if (!apiProbe.ok) {
					lastError = `api status ${apiProbe.status}`;
					await sleep(POLL_INTERVAL_MS);
					continue;
				}
				process.env.TINYBIRD_US_EAST_API_URL = TINYBIRD_LOCAL_URL;
				process.env.TINYBIRD_US_EAST_TOKEN = tokens.workspace_admin_token;
				log(`Tinybird Local ready on ${TINYBIRD_LOCAL_URL} (env wired)`);
				return;
			}
			lastError = `status ${response.status}`;
		} catch (error) {
			lastError = (error as Error).message ?? "fetch-error";
		}
		await sleep(POLL_INTERVAL_MS);
	}
	throw new Error(
		`[tw-boot] Tinybird Local (${url}) not ready within ${timeoutMs}ms (last: ${lastError}) — aborting worker boot`,
	);
};

/**
 * Binds the orchestrator-created Svix app into the localhost org (plan §7/§9a).
 * The orchestrator now CREATES + RECORDS the one dedicated svix-shard app before
 * this worker boots (so a fork/boot failure can never orphan an untracked Svix
 * app), injecting its id as `SVIX_APP_ID`. This worker only writes
 * `svix_config.sandbox_app_id` so the tests' `getTestSvixAppId` resolves — it
 * does NOT call `createSvixApp`.
 */
const provisionSvixApp = async (orgId: string): Promise<void> => {
	const svixAppId = process.env.SVIX_APP_ID;
	if (!svixAppId) {
		throw new Error(
			"[tw-boot] NEEDS_SVIX set but SVIX_APP_ID is missing — the orchestrator must create + inject the Svix app id (plan §9a)",
		);
	}

	log(`binding orchestrator-created Svix app ${svixAppId} into the Svix shard`);
	const { db } = await import("@server/db/initDrizzle.js");
	const { OrgService } = await import("@server/internal/orgs/OrgService.js");

	const org = await OrgService.get({ db, orgId });

	const updated = await OrgService.update({
		db,
		orgId,
		updates: {
			svix_config: {
				sandbox_app_id: svixAppId,
				live_app_id: org.svix_config?.live_app_id ?? "",
			},
		},
	});

	if (!updated) {
		throw new Error(
			`[tw-boot] failed to bind svix_config for org ${orgId} — update returned no row`,
		);
	}

	log(
		`Svix app ${svixAppId} bound to org ${orgId} (svix_config.sandbox_app_id)`,
	);
};

/**
 * Starts the Autumn server on the dev single-process path (`bun src/index.ts`,
 * NODE_ENV=development). NODE_ENV must NOT be `production` or skip-verify turns
 * off and the legacy seeder demands a webhook secret we never stored (§6a gotcha
 * a, §11a). Returns the long-lived subprocess so the caller keeps it alive.
 */
const startServer = (repoRoot: string, port: number): Subprocess => {
	const serverRoot = join(repoRoot, "server");
	log(`starting Autumn server (bun src/index.ts) on :${port}`);
	return spawn(["bun", "src/index.ts"], {
		cwd: serverRoot,
		stdout: "inherit",
		stderr: "inherit",
		env: {
			...process.env,
			NODE_ENV: "development",
			SERVER_PORT: String(port),
		} as Record<string, string>,
	});
};

/**
 * Starts the SQS queue workers (`bun src/workers.ts`) AND the cron job
 * (`bun src/cron.ts`). WITHOUT these, tests that POST to `/track` / `/batch_track`
 * fail: the server fails open and returns 202 ("queued for replay"), the message
 * lands in `autumn-track.fifo`, and nothing ever drains it — so balances never
 * settle and every balance assertion is wrong. The cron (runs every minute) is
 * what resets/expires entitlements and generates invoices. Both skip Infisical
 * (no creds in the µVM → `initInfisical` no-ops) and inherit the localhost
 * service env from `process.env`. NODE_ENV=development keeps the dev process
 * counts + skip-verify consistent with the server.
 */
const startBackgroundProcs = (
	repoRoot: string,
): { workersProc: Subprocess; cronProc: Subprocess } => {
	const serverRoot = join(repoRoot, "server");
	const env = {
		...process.env,
		NODE_ENV: "development",
	} as Record<string, string>;

	log("starting SQS queue workers (bun src/workers.ts)");
	const workersProc = spawn(["bun", "src/workers.ts"], {
		cwd: serverRoot,
		stdout: "inherit",
		stderr: "inherit",
		env,
	});

	log("starting cron (bun src/cron.ts)");
	const cronProc = spawn(["bun", "src/cron.ts"], {
		cwd: serverRoot,
		stdout: "inherit",
		stderr: "inherit",
		env,
	});

	return { workersProc, cronProc };
};

const main = async (): Promise<void> => {
	const repoRoot = process.cwd();
	const serverPort = resolveServerPort();

	const { TEST_ORG_CONFIG } = await import(
		"../../setupTestUtils/createTestOrg.js"
	);
	const orgId =
		process.env.ORG_ID && process.env.ORG_ID.length > 0
			? process.env.ORG_ID
			: TEST_ORG_CONFIG.id;

	const stripeAccountId = process.env.STRIPE_ACCOUNT_ID;
	if (!stripeAccountId) {
		throw new Error(
			"[tw-boot] STRIPE_ACCOUNT_ID is required — the orchestrator must inject the sub-account it created (plan §9a)",
		);
	}

	// 1 + 2. Native services up, then wait for their ports. start-services.sh
	// already gates on Tinybird readiness; the extra wire step resolves its token
	// into env before the server/workers spawn.
	await startNativeServices(repoRoot);
	const hasTinybird = existsSync(TINYBIRD_MARKER);
	await Promise.all([
		waitForTcpPort("PostgreSQL", PG_PORT, SERVICE_HEALTH_TIMEOUT_MS),
		waitForTcpPort("Dragonfly", DRAGONFLY_PORT, SERVICE_HEALTH_TIMEOUT_MS),
		waitForTcpPort("goaws (SQS)", ELASTICMQ_PORT, SERVICE_HEALTH_TIMEOUT_MS),
		hasTinybird
			? wireTinybirdEnv(SERVICE_HEALTH_TIMEOUT_MS)
			: Promise.resolve(log("Tinybird Local not on this image — skipping")),
	]);

	// 3. Bind the orchestrator-created Svix app (only when flagged). It only
	//    touches the DB, so it runs before the server starts to keep all DB-bind
	//    steps together.
	if (isTruthyEnv(process.env.NEEDS_SVIX)) {
		await provisionSvixApp(orgId);
	}

	// 4. Bind the Stripe sub-account into the localhost DB (§6a step 2 / §9a).
	const { bindStripeAccount } = await import("./bindStripeAccount.js");
	await bindStripeAccount({ orgId, stripeAccountId });

	// 5 + 6. Start the server and wait for health.
	const serverProc = startServer(repoRoot, serverPort);
	let serverExited = false;
	void serverProc.exited.then((code) => {
		serverExited = true;
		if (code !== 0) {
			console.error(
				chalk.red(`[tw-boot] Autumn server exited early with code ${code}`),
			);
		}
	});

	// 5b. Start the SQS workers + cron so /track messages get drained and balances
	//     settle (without these every balance test fails with a 202 fail-open).
	//     They run independently of server health; monitor them for early crashes.
	const { workersProc, cronProc } = startBackgroundProcs(repoRoot);
	void workersProc.exited.then((code) => {
		if (code !== 0) {
			console.error(
				chalk.red(`[tw-boot] SQS workers exited early with code ${code}`),
			);
		}
	});
	void cronProc.exited.then((code) => {
		if (code !== 0) {
			console.error(chalk.red(`[tw-boot] cron exited early with code ${code}`));
		}
	});

	await waitForServerHealth(serverPort, SERVER_HEALTH_TIMEOUT_MS);

	if (serverExited) {
		throw new Error(
			"[tw-boot] Autumn server process exited before becoming healthy — aborting worker boot",
		);
	}

	// 7. Signal readiness. The orchestrator scans stdout for this exact line, then
	//    starts dispatching `bun test <file>` to this worker (plan §8.2).
	log(`worker ready (env=${TW_ENV}, server :${serverPort})`);
	console.log(READY_SENTINEL);

	// Keep the process alive so the server + workers + cron stay up for the run.
	await Promise.all([serverProc.exited, workersProc.exited, cronProc.exited]);
};

if (import.meta.main) {
	main().catch((error) => {
		console.error(chalk.red(`[tw-boot] FATAL: ${(error as Error).message}`));
		process.exit(1);
	});
}
