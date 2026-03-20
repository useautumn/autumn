import { expect, test } from "bun:test";
import chalk from "chalk";

const BASE_URL = process.env.AUTUMN_TEST_BASE_URL || "http://localhost:8080";
const SECRET_KEY = process.env.UNIT_TEST_AUTUMN_SECRET_KEY || "";

const headers = {
	"Content-Type": "application/json",
	Authorization: `Bearer ${SECRET_KEY}`,
};

const CUSTOMER_ID = "redis-failover-test-customer";
const FEATURE_ID = "messages";

// Failover timing (must match redisFailover.ts constants)
const FAILOVER_THRESHOLD_MS = 15_000;
const RECOVERY_THRESHOLD_MS = 5_000;
const POLL_INTERVAL_MS = 2_000;

type FailoverStatus = {
	ok: boolean;
	phase: string;
	isUsingFailover: boolean;
	failoverRegion: string | null;
	primaryStatus: string;
	failoverStatus: string | null;
	msInPhase: number;
	blipsLastHour: number;
	durationMs?: number;
	error?: string;
};

const redisAction = async ({
	action,
}: {
	action: "status" | "kill-primary" | "recover-primary" | "ping";
}): Promise<FailoverStatus> => {
	const res = await fetch(`${BASE_URL}/v1/debug/redis-failover`, {
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
}): Promise<{
	label: string;
	status: number;
	durationMs: number;
	ok: boolean;
}> => {
	const start = Date.now();
	const res = await fetch(`${BASE_URL}${url}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});
	const durationMs = Date.now() - start;
	return { label, status: res.status, durationMs, ok: res.ok };
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test(`${chalk.yellowBright("redis failover: full lifecycle")}`, async () => {
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
			name: "Redis Failover Test",
			email: `${CUSTOMER_ID}@example.com`,
			internal_options: { disable_defaults: true },
		}),
	});
	console.log(`  Customer create: ${createRes.status}`);

	// ---- 1. Verify initial state: primary is active ----
	console.log("\n--- Step 1: Verify primary is active ---");
	const initialStatus = await redisAction({ action: "status" });
	console.log(`  Phase: ${initialStatus.phase}`);
	console.log(`  Primary: ${initialStatus.primaryStatus}`);
	console.log(`  Failover: ${initialStatus.failoverStatus}`);
	console.log(`  Using failover: ${initialStatus.isUsingFailover}`);

	expect(initialStatus.isUsingFailover).toBe(false);
	expect(initialStatus.primaryStatus).toBe("ready");

	// Verify endpoints work with primary
	const preCheck = await timedFetch({
		label: "pre-failover check",
		url: "/v1/balances.check",
		body: { customer_id: CUSTOMER_ID, feature_id: FEATURE_ID },
	});
	console.log(`  Check: ${preCheck.durationMs}ms (${preCheck.status})`);
	expect(preCheck.ok).toBe(true);

	// ---- 2. Kill primary Redis ----
	console.log("\n--- Step 2: Kill primary Redis ---");
	await redisAction({ action: "kill-primary" });
	console.log(`  Primary disconnected`);

	// ---- 3. Wait for failover to trigger ----
	// Must wait: threshold + up to one poll interval + buffer
	const failoverWait = FAILOVER_THRESHOLD_MS + POLL_INTERVAL_MS + 2000;
	console.log(`\n--- Step 3: Waiting ${failoverWait}ms for failover ---`);
	await wait(failoverWait);

	const failoverStatus = await redisAction({ action: "status" });
	console.log(`  Phase: ${failoverStatus.phase}`);
	console.log(`  Primary: ${failoverStatus.primaryStatus}`);
	console.log(`  Failover: ${failoverStatus.failoverStatus}`);
	console.log(`  Using failover: ${failoverStatus.isUsingFailover}`);

	if (failoverStatus.failoverStatus) {
		// Only assert failover if a failover region is configured
		expect(failoverStatus.isUsingFailover).toBe(true);

		// Verify endpoints work on failover
		console.log("\n--- Step 4: Test endpoints on failover ---");
		const [getCustomer, check, track] = await Promise.all([
			timedFetch({
				label: "GET /customers/:id",
				url: `/v1/customers/${CUSTOMER_ID}`,
				method: "GET",
			}),
			timedFetch({
				label: "POST /check",
				url: "/v1/balances.check",
				body: { customer_id: CUSTOMER_ID, feature_id: FEATURE_ID },
			}),
			timedFetch({
				label: "POST /track",
				url: "/v1/balances.track",
				body: {
					customer_id: CUSTOMER_ID,
					feature_id: FEATURE_ID,
					value: 1,
				},
			}),
		]);

		for (const r of [getCustomer, check, track]) {
			console.log(`  ${r.label}: ${r.durationMs}ms (${r.status})`);
		}

		// Endpoints should still work (via failover Redis or Postgres fallback)
		expect(check.ok).toBe(true);
		expect(track.ok).toBe(true);
	} else {
		console.log(
			"  No failover region configured — skipping failover assertions",
		);
	}

	// ---- 5. Recover primary ----
	console.log("\n--- Step 5: Recover primary ---");
	await redisAction({ action: "recover-primary" });
	const recoveryWait = RECOVERY_THRESHOLD_MS + POLL_INTERVAL_MS + 2000;
	console.log(
		`  Reconnect triggered, waiting ${recoveryWait}ms for recovery...`,
	);
	await wait(recoveryWait);

	const recoveredStatus = await redisAction({ action: "status" });
	console.log(`  Phase: ${recoveredStatus.phase}`);
	console.log(`  Primary: ${recoveredStatus.primaryStatus}`);
	console.log(`  Using failover: ${recoveredStatus.isUsingFailover}`);

	expect(recoveredStatus.primaryStatus).toBe("ready");
	expect(recoveredStatus.isUsingFailover).toBe(false);

	// Verify endpoints work after recovery
	console.log("\n--- Step 6: Test endpoints after recovery ---");
	const [postGetCus, postCheck, postTrack] = await Promise.all([
		timedFetch({
			label: "GET /customers/:id",
			url: `/v1/customers/${CUSTOMER_ID}`,
			method: "GET",
		}),
		timedFetch({
			label: "POST /check",
			url: "/v1/balances.check",
			body: { customer_id: CUSTOMER_ID, feature_id: FEATURE_ID },
		}),
		timedFetch({
			label: "POST /track",
			url: "/v1/balances.track",
			body: {
				customer_id: CUSTOMER_ID,
				feature_id: FEATURE_ID,
				value: 1,
			},
		}),
	]);

	for (const r of [postGetCus, postCheck, postTrack]) {
		console.log(`  ${r.label}: ${r.durationMs}ms (${r.status})`);
	}

	expect(postGetCus.ok).toBe(true);
	expect(postCheck.ok).toBe(true);
	expect(postTrack.ok).toBe(true);

	console.log("\nRedis failover lifecycle complete.");
}, 90_000);

test(`${chalk.yellowBright("redis failover: blip does NOT trigger failover")}`, async () => {
	// ---- 1. Verify we start in NORMAL ----
	console.log("\n--- Step 1: Verify NORMAL state ---");
	const initial = await redisAction({ action: "status" });
	console.log(`  Phase: ${initial.phase}, blips: ${initial.blipsLastHour}`);
	expect(initial.phase).toBe("NORMAL");
	expect(initial.isUsingFailover).toBe(false);
	const blipsBefore = initial.blipsLastHour;

	// ---- 2. Kill primary (simulate BGSAVE blip) ----
	console.log("\n--- Step 2: Kill primary (simulating ~8s BGSAVE blip) ---");
	await redisAction({ action: "kill-primary" });

	// Wait 4s — should be in DEGRADED but NOT yet FAILOVER (threshold is 15s)
	await wait(4_000);
	const degraded = await redisAction({ action: "status" });
	console.log(
		`  Phase after 4s: ${degraded.phase} (msInPhase: ${degraded.msInPhase})`,
	);
	expect(degraded.phase).toBe("DEGRADED");
	expect(degraded.isUsingFailover).toBe(false);

	// ---- 3. Recover primary before threshold ----
	console.log("\n--- Step 3: Recover primary (before 15s threshold) ---");
	await redisAction({ action: "recover-primary" });

	// Wait for primary to reconnect + next poll tick
	await wait(POLL_INTERVAL_MS + 2_000);

	const afterBlip = await redisAction({ action: "status" });
	console.log(`  Phase: ${afterBlip.phase}, blips: ${afterBlip.blipsLastHour}`);

	// Should be back in NORMAL, never hit FAILOVER
	expect(afterBlip.phase).toBe("NORMAL");
	expect(afterBlip.isUsingFailover).toBe(false);

	// Blip counter should have incremented
	expect(afterBlip.blipsLastHour).toBe(blipsBefore + 1);

	// ---- 4. Verify endpoints still work on primary ----
	console.log("\n--- Step 4: Verify endpoints work ---");
	const check = await timedFetch({
		label: "POST /check",
		url: "/v1/balances.check",
		body: { customer_id: CUSTOMER_ID, feature_id: FEATURE_ID },
	});
	console.log(`  ${check.label}: ${check.durationMs}ms (${check.status})`);
	expect(check.ok).toBe(true);

	console.log("\nBlip test complete — failover was NOT triggered.");
}, 30_000);
