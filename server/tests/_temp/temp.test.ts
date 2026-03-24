import { describe, expect, test } from "bun:test";
import { AppEnv, type FullCustomer } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { entities as entityFixtures } from "@tests/utils/fixtures/db/entities";
import chalk from "chalk";
import { redis } from "@/external/redis/initRedis.js";
import { buildPathIndex } from "@/internal/customers/cache/pathIndex/buildPathIndex.js";
import { buildPathIndexKey } from "@/internal/customers/cache/pathIndex/pathIndexConfig.js";
import {
	buildFullCustomerCacheKey,
	FULL_CUSTOMER_CACHE_TTL_SECONDS,
} from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";

const ENTITY_COUNT = 100;
const CUS_ENTS_PER_PRODUCT = 10;
const ORG_ID = "org_perf_test";
const ENV = AppEnv.Sandbox;
const CUSTOMER_ID = "cus_perf_large";

const buildLargeFullCustomer = (): FullCustomer => {
	const entitiesList = Array.from({ length: ENTITY_COUNT }, (_, i) =>
		entityFixtures.create({
			id: `entity_${i}`,
			featureId: `entity_feature_${i}`,
		}),
	);

	const cusProducts = entitiesList.map((entity, entityIdx) => {
		const cusEnts = Array.from({ length: CUS_ENTS_PER_PRODUCT }, (_, ceIdx) =>
			customerEntitlements.create({
				id: `cus_ent_${entityIdx}_${ceIdx}`,
				featureId: `feature_${ceIdx}`,
				featureName: `Feature ${ceIdx}`,
				allowance: 1000,
				balance: 500,
				customerProductId: `cus_prod_entity_${entityIdx}`,
				entityFeatureId: entity.feature_id,
				entities: {
					[entity.id!]: { id: entity.id!, balance: 500, adjustment: 0 },
				},
			}),
		);

		return customerProducts.create({
			id: `cus_prod_entity_${entityIdx}`,
			productId: `prod_entity_${entityIdx}`,
			customerEntitlements: cusEnts,
			internalEntityId: entity.internal_id,
			entityId: entity.id!,
		});
	});

	const fullCustomer: FullCustomer = {
		...customers.create({ customerProducts: cusProducts }),
		id: CUSTOMER_ID,
		org_id: ORG_ID,
		env: ENV,
		entities: entitiesList,
		extra_customer_entitlements: [],
	};

	return fullCustomer;
};

const cacheKey = buildFullCustomerCacheKey({
	orgId: ORG_ID,
	env: ENV,
	customerId: CUSTOMER_ID,
});

const pathIdxKey = buildPathIndexKey({
	orgId: ORG_ID,
	env: ENV,
	customerId: CUSTOMER_ID,
});

const formatStats = (
	timings: number[],
): { min: number; avg: number; p95: number; max: number } => {
	const sorted = [...timings].sort((a, b) => a - b);
	const sum = sorted.reduce((acc, t) => acc + t, 0);
	const p95Index = Math.floor(sorted.length * 0.95);
	return {
		min: sorted[0],
		avg: sum / sorted.length,
		p95: sorted[p95Index],
		max: sorted[sorted.length - 1],
	};
};

const printStats = (label: string, stats: ReturnType<typeof formatStats>) => {
	console.log(
		`  ${label}: min=${stats.min.toFixed(2)}ms  avg=${stats.avg.toFixed(2)}ms  p95=${stats.p95.toFixed(2)}ms  max=${stats.max.toFixed(2)}ms`,
	);
};

// ═══════════════════════════════════════════════════════════════════
// Block 1: Setup — seed large FullCustomer into Redis
// ═══════════════════════════════════════════════════════════════════
describe(chalk.blueBright("setup: seed large FullCustomer"), () => {
	test("seed large FullCustomer in Redis", async () => {
		const fullCustomer = buildLargeFullCustomer();
		const serialized = JSON.stringify(fullCustomer);
		console.log(
			`  Serialized FullCustomer size: ${(serialized.length / 1024 / 1024).toFixed(2)} MB`,
		);
		console.log(
			`  Customer products: ${fullCustomer.customer_products.length}`,
		);
		console.log(
			`  Total cusEnts: ${fullCustomer.customer_products.reduce((sum, cp) => sum + cp.customer_entitlements.length, 0)}`,
		);
		console.log(`  Entities: ${fullCustomer.entities.length}`);

		const pathIndexEntries = buildPathIndex({ fullCustomer });
		const pathIndexJson = JSON.stringify(pathIndexEntries);
		console.log(
			`  Path index entries: ${Object.keys(pathIndexEntries).length}`,
		);
		console.log(
			`  Path index size: ${(pathIndexJson.length / 1024).toFixed(2)} KB`,
		);

		const result = await redis.setFullCustomerCache(
			cacheKey,
			ORG_ID,
			ENV,
			CUSTOMER_ID,
			String(Date.now()),
			String(FULL_CUSTOMER_CACHE_TTL_SECONDS),
			serialized,
			"true",
			pathIndexJson,
		);

		expect(result).toBe("OK");

		const exists = await redis.call("EXISTS", cacheKey);
		expect(exists).toBe(1);

		const pathExists = await redis.call("EXISTS", pathIdxKey);
		expect(pathExists).toBe(1);

		console.log(chalk.green("  FullCustomer seeded successfully"));
	});
});

// ═══════════════════════════════════════════════════════════════════
// Helpers for building deduction params
// ═══════════════════════════════════════════════════════════════════

const buildDeductionParams = ({
	iteration,
	entitlementCount = 1,
}: {
	iteration: number;
	entitlementCount?: number;
}) => {
	const sortedEntitlements = Array.from(
		{ length: entitlementCount },
		(_, idx) => {
			const entIdx = (iteration * entitlementCount + idx) % ENTITY_COUNT;
			const ceIdx = (iteration * entitlementCount + idx) % CUS_ENTS_PER_PRODUCT;
			return {
				customer_entitlement_id: `cus_ent_${entIdx}_${ceIdx}`,
				credit_cost: 1,
				feature_id: `feature_${ceIdx}`,
				entity_feature_id: `entity_feature_${entIdx}`,
				usage_allowed: true,
				min_balance: null,
				max_balance: null,
			};
		},
	);

	const entityIdx = iteration % ENTITY_COUNT;
	const ceIdx = iteration % CUS_ENTS_PER_PRODUCT;
	return {
		org_id: ORG_ID,
		env: ENV,
		customer_id: CUSTOMER_ID,
		sorted_entitlements: sortedEntitlements,
		spend_limit_by_feature_id: null,
		usage_based_cus_ent_ids_by_feature_id: null,
		amount_to_deduct: 1,
		target_balance: null,
		target_entity_id: `entity_${entityIdx}`,
		rollovers: null,
		skip_additional_balance: false,
		alter_granted_balance: false,
		overage_behaviour: "allow",
		feature_id: `feature_${ceIdx}`,
		lock: null,
		unwind_value: null,
		lock_receipt_key: null,
	};
};

type SlowlogEntry = [
	id: number,
	timestamp: number,
	durationMicros: number,
	command: string[],
	clientIp: string,
	clientName: string,
];

/**
 * Runs a batch of deductions and measures server-side execution time via SLOWLOG.
 * SLOWLOG records commands that exceed the threshold (in microseconds).
 * By setting the threshold to 0, every command is logged.
 */
const runSlowlogBenchmark = async ({
	iterations,
	label,
	entitlementCount = 1,
}: {
	iterations: number;
	label: string;
	entitlementCount?: number;
}) => {
	// Set threshold to 0 to capture ALL commands, keep enough entries
	await redis.call("CONFIG", "SET", "slowlog-log-slower-than", "0");
	await redis.call("CONFIG", "SET", "slowlog-max-len", "1024");
	await redis.call("SLOWLOG", "RESET");

	const e2eTimings: number[] = [];

	for (let i = 0; i < iterations; i++) {
		const luaParams = buildDeductionParams({ iteration: i, entitlementCount });
		const start = performance.now();
		const result = await redis.deductFromCustomerEntitlements(
			cacheKey,
			JSON.stringify(luaParams),
		);
		e2eTimings.push(performance.now() - start);

		const parsed = JSON.parse(result);
		expect(parsed.error).toBeNull();
	}

	// Collect slowlog entries for EVALSHA commands (our Lua scripts)
	const rawEntries = (await redis.call(
		"SLOWLOG",
		"GET",
		"1024",
	)) as SlowlogEntry[];

	const evalEntries = rawEntries.filter(
		(entry) =>
			entry[3] && (entry[3][0] === "evalsha" || entry[3][0] === "EVALSHA"),
	);

	// Duration is in microseconds (entry[2])
	const serverTimings = evalEntries.map((entry) => entry[2] / 1000);

	// Restore default slowlog config
	await redis.call("CONFIG", "SET", "slowlog-log-slower-than", "10000");

	const e2eStats = formatStats(e2eTimings);
	const serverStats =
		serverTimings.length > 0 ? formatStats(serverTimings) : null;

	console.log(chalk.bold(`\n  ${label} (${iterations} iterations):`));
	printStats("End-to-end (TS)", e2eStats);
	if (serverStats) {
		printStats("Server-side (SLOWLOG)", serverStats);
		const avgRtt = e2eStats.avg - serverStats.avg;
		console.log(`  Network RTT (avg): ~${avgRtt.toFixed(2)}ms`);
	} else {
		console.log("  (no SLOWLOG entries captured for EVALSHA)");
	}

	return { e2eStats, serverStats };
};

// ═══════════════════════════════════════════════════════════════════
// Block 2: Benchmark — re-runnable against seeded data
// ═══════════════════════════════════════════════════════════════════
describe(chalk.yellowBright("benchmark: Redis operations"), () => {
	const ITERATIONS = 50;

	test("benchmark JSON.GET full read (TS-side getCachedFullCustomer cost)", async () => {
		// Also measure server-side via SLOWLOG
		await redis.call("CONFIG", "SET", "slowlog-log-slower-than", "0");
		await redis.call("CONFIG", "SET", "slowlog-max-len", "256");
		await redis.call("SLOWLOG", "RESET");

		const timings: number[] = [];
		for (let i = 0; i < ITERATIONS; i++) {
			const start = performance.now();
			const raw = (await redis.call("JSON.GET", cacheKey)) as string | null;
			expect(raw).toBeTruthy();
			JSON.parse(raw!);
			const elapsed = performance.now() - start;
			timings.push(elapsed);
		}

		const rawEntries = (await redis.call(
			"SLOWLOG",
			"GET",
			"256",
		)) as SlowlogEntry[];
		const jsonGetEntries = rawEntries.filter(
			(entry) =>
				entry[3] && (entry[3][0] === "JSON.GET" || entry[3][0] === "json.get"),
		);
		const serverTimings = jsonGetEntries.map((entry) => entry[2] / 1000);

		await redis.call("CONFIG", "SET", "slowlog-log-slower-than", "10000");

		const e2eStats = formatStats(timings);
		const serverStats =
			serverTimings.length > 0 ? formatStats(serverTimings) : null;

		console.log(
			chalk.cyan(`\n  JSON.GET '.' + JSON.parse (${ITERATIONS} iterations):`),
		);
		printStats("End-to-end (TS)", e2eStats);
		if (serverStats) {
			printStats("Server-side (SLOWLOG)", serverStats);
			console.log(
				`  Network + JSON.parse (avg): ~${(e2eStats.avg - serverStats.avg).toFixed(2)}ms`,
			);
		}
	});

	const entitlementCounts = [1, 5, 10, 20];

	for (const count of entitlementCounts) {
		test(`benchmark deduction WITH path index — ${count} entitlement(s)`, async () => {
			// Re-seed to reset balances
			const fullCustomer = buildLargeFullCustomer();
			const pathIndexEntries = buildPathIndex({ fullCustomer });
			await redis.setFullCustomerCache(
				cacheKey,
				ORG_ID,
				ENV,
				CUSTOMER_ID,
				String(Date.now()),
				String(FULL_CUSTOMER_CACHE_TTL_SECONDS),
				JSON.stringify(fullCustomer),
				"true",
				JSON.stringify(pathIndexEntries),
			);

			const exists = await redis.call("EXISTS", pathIdxKey);
			expect(exists).toBe(1);

			const { e2eStats, serverStats } = await runSlowlogBenchmark({
				iterations: ITERATIONS,
				label: chalk.green(`Fast path — ${count} entitlement(s)`),
				entitlementCount: count,
			});

			(globalThis as Record<string, unknown>)[`__fastPathStats_${count}`] = {
				e2eStats,
				serverStats,
			};
		});
	}

	for (const count of entitlementCounts) {
		test(`benchmark deduction WITHOUT path index — ${count} entitlement(s)`, async () => {
			// Re-seed to reset balances, then delete path index
			const fullCustomer = buildLargeFullCustomer();
			const pathIndexEntries = buildPathIndex({ fullCustomer });
			await redis.setFullCustomerCache(
				cacheKey,
				ORG_ID,
				ENV,
				CUSTOMER_ID,
				String(Date.now()),
				String(FULL_CUSTOMER_CACHE_TTL_SECONDS),
				JSON.stringify(fullCustomer),
				"true",
				JSON.stringify(pathIndexEntries),
			);
			await redis.call("DEL", pathIdxKey);

			const { e2eStats, serverStats } = await runSlowlogBenchmark({
				iterations: ITERATIONS,
				label: chalk.red(`Fallback — ${count} entitlement(s)`),
				entitlementCount: count,
			});

			(globalThis as Record<string, unknown>)[`__fallbackStats_${count}`] = {
				e2eStats,
				serverStats,
			};
		});
	}

	test("comparison table", async () => {
		// Re-seed for subsequent runs
		const fullCustomer = buildLargeFullCustomer();
		const pathIndexEntries = buildPathIndex({ fullCustomer });
		await redis.setFullCustomerCache(
			cacheKey,
			ORG_ID,
			ENV,
			CUSTOMER_ID,
			String(Date.now()),
			String(FULL_CUSTOMER_CACHE_TTL_SECONDS),
			JSON.stringify(fullCustomer),
			"true",
			JSON.stringify(pathIndexEntries),
		);

		type Stats = {
			e2eStats: ReturnType<typeof formatStats>;
			serverStats: ReturnType<typeof formatStats> | null;
		};
		const g = globalThis as Record<string, unknown>;

		console.log(chalk.bold("\n  ─── Comparison: Fast path vs Fallback ───"));
		console.log("  │ Ents │ Fast (server) │ Fallback (server) │ Speedup │");
		console.log("  │──────│───────────────│───────────────────│─────────│");

		for (const count of entitlementCounts) {
			const fast = g[`__fastPathStats_${count}`] as Stats | undefined;
			const slow = g[`__fallbackStats_${count}`] as Stats | undefined;
			if (fast?.serverStats && slow?.serverStats) {
				const speedup = slow.serverStats.avg / fast.serverStats.avg;
				console.log(
					`  │ ${String(count).padStart(4)} │ ${fast.serverStats.avg.toFixed(2).padStart(9)}ms   │ ${slow.serverStats.avg.toFixed(2).padStart(13)}ms   │ ${speedup.toFixed(1).padStart(5)}x  │`,
				);
			}
		}
	});

	test("benchmark setFullCustomerCache", async () => {
		const fullCustomer = buildLargeFullCustomer();
		const serialized = JSON.stringify(fullCustomer);
		const pathIndexEntries = buildPathIndex({ fullCustomer });
		const pathIndexJson = JSON.stringify(pathIndexEntries);

		await redis.call("CONFIG", "SET", "slowlog-log-slower-than", "0");
		await redis.call("CONFIG", "SET", "slowlog-max-len", "256");
		await redis.call("SLOWLOG", "RESET");

		const timings: number[] = [];
		for (let i = 0; i < ITERATIONS; i++) {
			const start = performance.now();
			const result = await redis.setFullCustomerCache(
				cacheKey,
				ORG_ID,
				ENV,
				CUSTOMER_ID,
				String(Date.now()),
				String(FULL_CUSTOMER_CACHE_TTL_SECONDS),
				serialized,
				"true",
				pathIndexJson,
			);
			const elapsed = performance.now() - start;
			timings.push(elapsed);
			expect(result).toBe("OK");
		}

		const rawEntries = (await redis.call(
			"SLOWLOG",
			"GET",
			"256",
		)) as SlowlogEntry[];
		const evalEntries = rawEntries.filter(
			(entry) =>
				entry[3] && (entry[3][0] === "evalsha" || entry[3][0] === "EVALSHA"),
		);
		const serverTimings = evalEntries.map((entry) => entry[2] / 1000);

		await redis.call("CONFIG", "SET", "slowlog-log-slower-than", "10000");

		const e2eStats = formatStats(timings);
		const serverStats =
			serverTimings.length > 0 ? formatStats(serverTimings) : null;

		console.log(
			chalk.magenta(`\n  setFullCustomerCache (${ITERATIONS} iterations):`),
		);
		printStats("End-to-end (TS)", e2eStats);
		if (serverStats) {
			printStats("Server-side (SLOWLOG)", serverStats);
		}
	});
});
