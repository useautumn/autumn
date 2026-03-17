import { expect, test } from "bun:test";
import chalk from "chalk";

const BASE_URL = process.env.AUTUMN_TEST_BASE_URL || "http://localhost:8080";
const SECRET_KEY = process.env.UNIT_TEST_AUTUMN_SECRET_KEY || "";

const headers = {
	"Content-Type": "application/json",
	Authorization: `Bearer ${SECRET_KEY}`,
};

type PoolTestResult = {
	ok: boolean;
	pool: string;
	action: string;
	durationMs: number;
	error?: string;
};

const poolTest = async ({
	action,
	pool,
	seconds,
	rows,
}: {
	action: "sleep" | "ping" | "cpu";
	pool: "general" | "critical";
	seconds?: number;
	rows?: number;
}): Promise<PoolTestResult> => {
	const res = await fetch(`${BASE_URL}/v1/debug/pool-test`, {
		method: "POST",
		headers,
		body: JSON.stringify({ action, pool, seconds, rows }),
	});
	return res.json();
};

const CUSTOMER_ID = "pool-isolation-test-customer";
const FEATURE_ID = "messages";
const FLOOD_COUNT = 20;
const CPU_ROWS = 10_000_000;
const CRITICAL_ROUNDS = 5;

type TimedResult = {
	label: string;
	status: number;
	durationMs: number;
	ok: boolean;
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
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});
	const durationMs = Date.now() - start;
	return { label, status: res.status, durationMs, ok: res.ok };
};

test(`${chalk.yellowBright("pool isolation: critical endpoints work while general pool is under CPU load")}`, async () => {
	// ---- Setup: delete then create customer ----
	console.log("\n--- Setup ---");
	console.log(`Deleting customer: ${CUSTOMER_ID}`);
	await fetch(`${BASE_URL}/v1/customers/${CUSTOMER_ID}`, {
		method: "DELETE",
		headers,
	}).catch(() => {});

	console.log(`Creating customer: ${CUSTOMER_ID}`);
	const createRes = await fetch(`${BASE_URL}/v1/customers`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			id: CUSTOMER_ID,
			name: "Pool Test Customer",
			email: `${CUSTOMER_ID}@example.com`,
			internal_options: { disable_defaults: true },
		}),
	});
	console.log(`  Customer create: ${createRes.status}`);

	// ---- Flood general pool with CPU-heavy queries ----
	console.log(
		`\n--- Flooding general pool (${FLOOD_COUNT} x CPU-burn queries, ${CPU_ROWS.toLocaleString()} rows each) ---`,
	);
	const floodPromises: Promise<unknown>[] = [];
	for (let i = 0; i < FLOOD_COUNT; i++) {
		floodPromises.push(
			poolTest({
				action: "cpu",
				pool: "general",
				rows: CPU_ROWS,
			}).catch((err) => ({ ok: false, error: err.message })),
		);
	}

	// Wait for queries to start and saturate connections + CPU
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// ---- Test critical endpoints under load (multiple rounds) ----
	console.log(
		`\n--- Testing critical endpoints (${CRITICAL_ROUNDS} rounds) while general pool is under CPU load ---`,
	);

	const allResults: TimedResult[] = [];

	for (let round = 1; round <= CRITICAL_ROUNDS; round++) {
		const [getCustomer, check, track] = await Promise.all([
			timedFetch({
				label: `[${round}] GET /customers/:id`,
				url: `/v1/customers/${CUSTOMER_ID}`,
				method: "GET",
			}),
			timedFetch({
				label: `[${round}] POST /check`,
				url: "/v1/balances.check",
				body: {
					customer_id: CUSTOMER_ID,
					feature_id: FEATURE_ID,
				},
			}),
			timedFetch({
				label: `[${round}] POST /track`,
				url: "/v1/balances.track",
				body: {
					customer_id: CUSTOMER_ID,
					feature_id: FEATURE_ID,
					value: 1,
				},
			}),
		]);

		allResults.push(getCustomer, check, track);

		const roundAvg = Math.round(
			(getCustomer.durationMs + check.durationMs + track.durationMs) / 3,
		);
		console.log(
			`  Round ${round}: get=${getCustomer.durationMs}ms check=${check.durationMs}ms track=${track.durationMs}ms (avg ${roundAvg}ms)`,
		);
	}

	// General pool ping (should be blocked)
	const generalPing = await Promise.race([
		poolTest({ action: "ping", pool: "general" }).then((r) => ({
			label: "General pool ping",
			status: r.ok ? 200 : 500,
			durationMs: r.durationMs,
			ok: r.ok,
		})),
		new Promise<TimedResult>((resolve) =>
			setTimeout(
				() =>
					resolve({
						label: "General pool ping",
						status: 0,
						durationMs: 5000,
						ok: false,
					}),
				5000,
			),
		),
	]);

	// ---- Report results ----
	const criticalAvg = Math.round(
		allResults.reduce((sum, r) => sum + r.durationMs, 0) / allResults.length,
	);
	const maxCritical = Math.max(...allResults.map((r) => r.durationMs));

	console.log("\n--- Summary ---");
	console.log(
		`  Critical endpoints: ${allResults.length} requests across ${CRITICAL_ROUNDS} rounds`,
	);
	console.log(`  Critical avg: ${criticalAvg}ms | max: ${maxCritical}ms`);
	console.log(
		`  General pool ping: ${generalPing.durationMs}ms (${generalPing.ok ? "OK" : "BLOCKED"})`,
	);
	console.log(
		`  Isolation factor: ${(generalPing.durationMs / Math.max(criticalAvg, 1)).toFixed(1)}x`,
	);

	// ---- Assertions ----
	for (const result of allResults) {
		expect(result.durationMs).toBeLessThan(2000);
		expect(result.ok).toBe(true);
	}

	// General pool should be blocked
	expect(generalPing.durationMs).toBeGreaterThan(criticalAvg);

	console.log("\nPool isolation is working — critical endpoints unaffected.");

	// Clean up
	console.log("\nWaiting for CPU-burn queries to finish...");
	await Promise.allSettled(floodPromises);
	console.log("Done.");
}, 120000);
