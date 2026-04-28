import { expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import chalk from "chalk";
import { assertNotProductionDb } from "@/db/dbUtils.js";

assertNotProductionDb();

const BASE_URL = process.env.AUTUMN_TEST_BASE_URL || "http://localhost:8080";
const SECRET_KEY = process.env.UNIT_TEST_AUTUMN_SECRET_KEY || "";

const headers = {
	"Content-Type": "application/json",
	Authorization: `Bearer ${SECRET_KEY}`,
};

const skipCacheHeaders = {
	...headers,
	"x-skip-cache": "true",
};

const CUSTOMER_ID = "pg-failover-test-customer";
const FEATURE_ID = "messages";

type PgHealthStatus = {
	ok: boolean;
	health: string;
	failureCount: number;
	probeActive: boolean;
	firstProbeSuccessAt: number | null;
	hasReplica: boolean;
};

type TimedResult = {
	label: string;
	status: number;
	durationMs: number;
	ok: boolean;
	body?: unknown;
};

const pgHealth = async ({
	action,
}: {
	action: "status" | "force-degraded" | "force-healthy";
}): Promise<PgHealthStatus> => {
	const res = await fetch(`${BASE_URL}/v1/debug/pg-health`, {
		method: "POST",
		headers,
		body: JSON.stringify({ action }),
	});
	return res.json();
};

const timedFetch = async ({
	label,
	url,
	method = "POST",
	body,
}: {
	label: string;
	url: string;
	method?: string;
	body?: Record<string, unknown>;
}): Promise<TimedResult> => {
	const start = Date.now();
	const res = await fetch(`${BASE_URL}${url}`, {
		method,
		headers: skipCacheHeaders,
		body: body ? JSON.stringify(body) : undefined,
	});
	const durationMs = Date.now() - start;
	const responseBody = await res.json().catch(() => null);
	return {
		label,
		status: res.status,
		durationMs,
		ok: res.ok,
		body: responseBody,
	};
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fire a batch of concurrent skip_cache requests (get customer + check only).
 * Track is excluded because skip_cache track does a Postgres deduction.
 * `count` controls how many of each endpoint to fire (default 1 = 2 requests total).
 */
const testCriticalEndpoints = async ({
	label,
	count = 1,
}: {
	label: string;
	count?: number;
}): Promise<TimedResult[]> => {
	const promises: Promise<TimedResult>[] = [];

	for (let i = 0; i < count; i++) {
		const suffix = count > 1 ? `-${i + 1}` : "";
		promises.push(
			timedFetch({
				label: `[${label}] GET /customers/:id${suffix}`,
				url: `/v1/customers/${CUSTOMER_ID}`,
				method: "GET",
			}),
			timedFetch({
				label: `[${label}] POST /check${suffix}`,
				url: "/v1/balances.check",
				body: { customer_id: CUSTOMER_ID, feature_id: FEATURE_ID },
			}),
		);
	}

	return Promise.all(promises);
};

const logResults = (
	results: TimedResult[],
	{ verbose }: { verbose?: boolean } = {},
) => {
	for (const r of results) {
		const status = r.ok ? "OK" : "FAIL";
		console.log(`  ${r.label}: ${r.durationMs}ms (${r.status} ${status})`);
		if (verbose && r.body) {
			console.log(`    body: ${JSON.stringify(r.body).slice(0, 200)}`);
		}
	}
};

// ---------------------------------------------------------------------------
// Flood worker management
// ---------------------------------------------------------------------------

let floodWorker: ChildProcess | null = null;

const startFloodWorker = (): ChildProcess => {
	const workerPath = new URL("./cpuFloodWorker.ts", import.meta.url).pathname;
	const worker = spawn("bun", [workerPath], {
		stdio: ["ignore", "pipe", "pipe"],
		env: process.env,
	});

	worker.stdout?.on("data", (data: Buffer) => {
		console.log(`  [flood] ${data.toString().trim()}`);
	});
	worker.stderr?.on("data", (data: Buffer) => {
		console.error(`  [flood:err] ${data.toString().trim()}`);
	});

	floodWorker = worker;
	return worker;
};

const stopFloodWorker = (): Promise<void> => {
	return new Promise((resolve) => {
		if (!floodWorker) {
			resolve();
			return;
		}

		const worker = floodWorker;
		floodWorker = null;

		worker.on("exit", () => resolve());
		worker.kill("SIGTERM");

		// Force kill after 5s if it doesn't exit gracefully
		setTimeout(() => {
			if (!worker.killed) {
				worker.kill("SIGKILL");
			}
			resolve();
		}, 5000);
	});
};

// Ensure flood worker is killed on ctrl+c or unexpected exit
const cleanup = () => {
	if (floodWorker && !floodWorker.killed) {
		floodWorker.kill("SIGKILL");
	}
	process.exit(1);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test(`${chalk.yellowBright("pg failover: critical endpoints failover to replica under sustained DB load")}`, async () => {
	try {
		// ---- Setup ----
		console.log("\n--- Setup ---");
		await fetch(`${BASE_URL}/v1/customers/${CUSTOMER_ID}`, {
			method: "DELETE",
			headers,
		}).catch(() => {});

		const createRes = await fetch(`${BASE_URL}/v1/customers`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				id: CUSTOMER_ID,
				name: "PG Failover Test",
				email: `${CUSTOMER_ID}@example.com`,
				internal_options: { disable_defaults: true },
			}),
		});
		console.log(`  Customer create: ${createRes.status}`);
		expect(createRes.ok).toBe(true);

		// Ensure clean state
		await pgHealth({ action: "force-healthy" });

		// ---- 1. Verify HEALTHY ----
		console.log(
			"\n--- Step 1: Verify HEALTHY + endpoints work (skip_cache) ---",
		);
		const initialStatus = await pgHealth({ action: "status" });
		console.log(
			`  Health: ${initialStatus.health} | Replica: ${initialStatus.hasReplica}`,
		);
		expect(initialStatus.health).toBe("HEALTHY");

		const healthyResults = await testCriticalEndpoints({
			label: "HEALTHY",
		});
		logResults(healthyResults);
		for (const r of healthyResults) {
			expect(r.ok).toBe(true);
		}

		// ---- 2. Start sustained CPU burn (direct DB connections) ----
		console.log(
			"\n--- Step 2: Starting CPU flood (20 direct DB connections) ---",
		);
		startFloodWorker();

		// Give the burns time to saturate DB CPU.
		// 20 concurrent heavy queries should peg the DB within seconds.
		console.log("  Waiting 20s for DB CPU to saturate...");
		await wait(20_000);

		// ---- 3. Fire skip_cache requests — expect failures ----
		// With DB CPU pegged, getFullCusQuery should be slow enough to hit
		// statement_timeout (10s) → fails → recordDbFailure().
		console.log(
			"\n--- Step 3: Firing skip_cache requests (expect failures from statement_timeout) ---",
		);

		let degraded = false;
		const MAX_ROUNDS = 15;

		for (let round = 1; round <= MAX_ROUNDS; round++) {
			// Fire 20x each endpoint (60 concurrent requests) to accumulate
			// failures fast enough to hit the 50-in-60s threshold.
			const results = await testCriticalEndpoints({
				label: `load-${round}`,
				count: 20,
			});
			const failures = results.filter((r) => !r.ok).length;
			const successes = results.filter((r) => r.ok).length;
			const slowCount = results.filter((r) => r.durationMs > 10_000).length;
			console.log(
				`  Round ${round}: ${failures} errors, ${slowCount} slow (>10s), ${successes} ok`,
			);

			const status = await pgHealth({ action: "status" });
			console.log(
				`    Health: ${status.health} | Failure count: ${status.failureCount}`,
			);

			if (status.health === "DEGRADED") {
				console.log(`  DEGRADED triggered at round ${round}`);
				degraded = true;
				break;
			}
		}

		// ---- 4. Verify DEGRADED ----
		console.log("\n--- Step 4: Verify DEGRADED ---");
		const degradedStatus = await pgHealth({ action: "status" });
		console.log(`  Health: ${degradedStatus.health}`);
		console.log(`  Probe active: ${degradedStatus.probeActive}`);
		console.log(`  Has replica: ${degradedStatus.hasReplica}`);

		if (!degraded) {
			console.log(
				"  WARNING: DEGRADED not triggered — DB may not be under enough load.",
			);
		}
		expect(degradedStatus.health).toBe("DEGRADED");

		// ---- 5. Test endpoints in DEGRADED mode ----
		if (degradedStatus.hasReplica) {
			console.log(
				"\n--- Step 5: Test endpoints in DEGRADED mode (should use replica) ---",
			);

			const degradedResults = await testCriticalEndpoints({
				label: "DEGRADED",
			});
			logResults(degradedResults);

			for (const r of degradedResults) {
				expect(r.ok).toBe(true);
			}

			// Extra round for stability
			const extraResults = await testCriticalEndpoints({
				label: "DEGRADED-r2",
			});
			logResults(extraResults);
			for (const r of extraResults) {
				expect(r.ok).toBe(true);
			}
		} else {
			console.log(
				"\n--- Step 5: SKIPPED (no DATABASE_REPLICA_URL configured) ---",
			);
		}

		// ---- 6. Stop flood + poll for recovery ----
		console.log("\n--- Step 6: Stopping flood worker ---");
		await stopFloodWorker();
		console.log("  Flood worker stopped, polling for recovery...");

		// Poll every 5s for up to 60s instead of a fixed wait.
		// The probe needs time to detect recovery + 10s stability.
		let recovered = false;
		const MAX_RECOVERY_POLLS = 12; // 12 * 5s = 60s max
		for (let i = 1; i <= MAX_RECOVERY_POLLS; i++) {
			await wait(5_000);
			const status = await pgHealth({ action: "status" });
			console.log(`  Poll ${i}: ${status.health}`);
			if (status.health === "HEALTHY") {
				recovered = true;
				break;
			}
		}

		// ---- 7. Verify HEALTHY recovery ----
		console.log("\n--- Step 7: Verify HEALTHY recovery ---");
		expect(recovered).toBe(true);

		// ---- 8. Endpoints work after recovery ----
		console.log("\n--- Step 8: Test endpoints after recovery (skip_cache) ---");
		const recoveredResults = await testCriticalEndpoints({
			label: "RECOVERED",
		});
		logResults(recoveredResults);
		for (const r of recoveredResults) {
			expect(r.ok).toBe(true);
		}

		console.log("\nPG failover lifecycle complete.");
	} finally {
		// Always clean up
		await stopFloodWorker();
		await pgHealth({ action: "force-healthy" }).catch(() => {});
	}
}, 300_000);
