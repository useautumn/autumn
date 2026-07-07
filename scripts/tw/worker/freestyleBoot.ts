#!/usr/bin/env bun

/**
 * Freestyle pre-booted worker bring-up. The memory snapshot this worker was
 * restored from already runs PG + Dragonfly + goaws AND the Autumn server +
 * SQS workers + cron — so unlike boot.ts, nothing is started here. Only the
 * per-worker identity binds happen, then READY:
 *
 *   1. Verify the snapshot-resumed server answers on SERVER_PORT (fail loud —
 *      a dead resume is a broken worker the orchestrator should replace).
 *   2. (if NEEDS_SVIX) bind the orchestrator-created Svix app into svix_config.
 *   3. Bind the Stripe sub-account into the localhost DB (same as boot.ts).
 *   4. Write this worker's pool key to the tw key file — the running server
 *      resolves it per-request via the initMasterStripe seam, since its
 *      snapshotted process env still carries the warm placeholder key.
 *   5. Print TW_WORKER_READY, then stay alive polling server health so the
 *      orchestrator's boot-process-death detection keeps working.
 */

import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "bun";
import chalk from "chalk";
import { SERVER_PORT, TW_ENV } from "../constants.js";
import {
	provisionSvixApp,
	READY_SENTINEL,
	startBackgroundProcs,
	startServer,
	waitForServerHealth,
} from "./boot.js";

const TW_WORKER_STRIPE_KEY_FILE = "/opt/autumn-tw/worker-stripe-key";
const RESUME_HEALTH_TIMEOUT_MS = 30_000;
const LIVENESS_POLL_MS = 10_000;
const LIVENESS_FAILURES_TO_DIE = 3;

const log = (message: string): void => {
	console.log(chalk.cyan(`[tw-fsboot] ${message}`));
};

const isTruthyEnv = (value: string | undefined): boolean =>
	value !== undefined && value !== "" && value !== "0" && value !== "false";

const resolveServerPort = (): number => {
	const parsed = Number.parseInt(process.env.SERVER_PORT ?? "", 10);
	return Number.isNaN(parsed) ? SERVER_PORT : parsed;
};

const main = async (): Promise<void> => {
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
			"[tw-fsboot] STRIPE_ACCOUNT_ID is required — the orchestrator must inject the sub-account it created",
		);
	}
	const stripeKey = process.env.STRIPE_SANDBOX_SECRET_KEY;
	if (!stripeKey) {
		throw new Error(
			"[tw-fsboot] STRIPE_SANDBOX_SECRET_KEY is required — this worker's pool key",
		);
	}

	// Stale snapshot → fast-forward in place: the orchestrator already checked
	// out the target sha (so THIS script is current); re-run warmup (install
	// delta + migrate + seed, services stay up) and restart the app procs on the
	// new code. All workers do this in parallel — wall cost is one worker's ff.
	if (isTruthyEnv(process.env.TW_SNAPSHOT_STALE)) {
		const repoRoot = process.cwd();
		log("stale snapshot — fast-forwarding worker to the target sha");
		for (const pattern of ["bun src/index.ts", "bun src/workers.ts", "bun src/cron.ts"]) {
			Bun.spawnSync(["pkill", "-f", pattern]);
		}
		const warmup = spawn(
			["bash", join(repoRoot, "scripts/tw/image/warmup.sh"), process.env.TW_TARGET_SHA ?? "HEAD"],
			{
				cwd: repoRoot,
				stdout: "inherit",
				stderr: "inherit",
				env: {
					...process.env,
					TW_SKIP_CLEAN_STOP: "1",
				} as Record<string, string>,
			},
		);
		const warmupExit = await warmup.exited;
		if (warmupExit !== 0) {
			throw new Error(`[tw-fsboot] fast-forward warmup.sh exited ${warmupExit}`);
		}
		const serverProc = startServer(repoRoot, serverPort);
		void serverProc.exited.then((code) => {
			if (code !== 0) {
				console.error(chalk.red(`[tw-fsboot] server exited early (code ${code})`));
			}
		});
		startBackgroundProcs(repoRoot);
	}

	// 1. The snapshot carries a running server (or the ff just restarted it).
	await waitForServerHealth(
		serverPort,
		isTruthyEnv(process.env.TW_SNAPSHOT_STALE) ? 120_000 : RESUME_HEALTH_TIMEOUT_MS,
	);
	log(`server healthy on :${serverPort}`);

	// 2 + 3. Per-worker DB binds.
	if (isTruthyEnv(process.env.NEEDS_SVIX)) {
		await provisionSvixApp(orgId);
	}
	const { bindStripeAccount } = await import("./bindStripeAccount.js");
	await bindStripeAccount({ orgId, stripeAccountId });

	// 4. The running server picks this up per-request (initMasterStripe seam).
	mkdirSync(dirname(TW_WORKER_STRIPE_KEY_FILE), { recursive: true });
	writeFileSync(TW_WORKER_STRIPE_KEY_FILE, stripeKey);
	chmodSync(TW_WORKER_STRIPE_KEY_FILE, 0o600);
	log("per-worker Stripe pool key written");

	// 5. READY, then liveness watch: exiting non-zero is how the orchestrator
	//    learns this worker died (its wait() rejects → evict + reschedule).
	log(`worker ready (env=${TW_ENV}, server :${serverPort}, prebooted)`);
	console.log(READY_SENTINEL);

	let consecutiveFailures = 0;
	for (;;) {
		await new Promise((resolve) => setTimeout(resolve, LIVENESS_POLL_MS));
		try {
			const response = await fetch(`http://127.0.0.1:${serverPort}/`, {
				signal: AbortSignal.timeout(3_000),
			});
			consecutiveFailures = response.ok ? 0 : consecutiveFailures + 1;
		} catch {
			consecutiveFailures += 1;
		}
		if (consecutiveFailures >= LIVENESS_FAILURES_TO_DIE) {
			console.error(
				chalk.red(
					`[tw-fsboot] server on :${serverPort} unhealthy ${consecutiveFailures}x — exiting`,
				),
			);
			process.exit(1);
		}
	}
};

if (import.meta.main) {
	main().catch((error) => {
		console.error(chalk.red(`[tw-fsboot] FATAL: ${(error as Error).message}`));
		process.exit(1);
	});
}
