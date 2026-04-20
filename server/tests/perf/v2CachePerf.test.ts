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

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const ORG_ID = "org_v2_perf";
const ENV = AppEnv.Sandbox;
const CUSTOMER_ID = "cus_v2_perf";
const ITERATIONS = 50;

const BOUNDED_CUSTOMER_PRODUCTS = 50;
const BOUNDED_CUSTOMER_CUS_ENTS_PER_PRODUCT = 3;
const BOUNDED_CUSTOMER_ENTITY_COUNT = 10;
const BOUNDED_CUSTOMER_EXTRA_CUS_ENTS = 5;

const ENTITY_SCOPED_PRODUCTS = 11;
const ENTITY_INHERITED_PRODUCTS = 50;
const ENTITY_CUS_ENTS_PER_PRODUCT = 3;
const ENTITY_EXTRA_CUS_ENTS = 5;

// ═══════════════════════════════════════════════════════════════════
// Fixture builders
// ═══════════════════════════════════════════════════════════════════

const buildBoundedFullCustomer = (): FullCustomer => {
	const entitiesList = Array.from(
		{ length: BOUNDED_CUSTOMER_ENTITY_COUNT },
		(_, i) =>
			entityFixtures.create({
				id: `entity_${i}`,
				featureId: `entity_feature_${i}`,
			}),
	);

	const cusProducts = Array.from(
		{ length: BOUNDED_CUSTOMER_PRODUCTS },
		(_, cpIdx) => {
			const cusEnts = Array.from(
				{ length: BOUNDED_CUSTOMER_CUS_ENTS_PER_PRODUCT },
				(_, ceIdx) =>
					customerEntitlements.create({
						id: `bounded_ce_${cpIdx}_${ceIdx}`,
						featureId: `feature_${ceIdx}`,
						featureName: `Feature ${ceIdx}`,
						allowance: 1000,
						balance: 500,
						customerProductId: `bounded_cp_${cpIdx}`,
					}),
			);

			return customerProducts.create({
				id: `bounded_cp_${cpIdx}`,
				productId: `prod_cus_${cpIdx}`,
				customerEntitlements: cusEnts,
			});
		},
	);

	const extraCustomerEntitlements = Array.from(
		{ length: BOUNDED_CUSTOMER_EXTRA_CUS_ENTS },
		(_, i) =>
			customerEntitlements.create({
				id: `bounded_extra_ce_${i}`,
				featureId: `extra_feature_${i}`,
				featureName: `Extra Feature ${i}`,
				allowance: 500,
				balance: 250,
				customerProductId: undefined,
			}),
	);
	for (const extraCusEnt of extraCustomerEntitlements) {
		extraCusEnt.customer_product_id = null as unknown as string;
	}

	return {
		...customers.create({ customerProducts: cusProducts }),
		id: CUSTOMER_ID,
		org_id: ORG_ID,
		env: ENV,
		entities: entitiesList,
		extra_customer_entitlements: extraCustomerEntitlements,
	};
};

const buildFullEntity = (): FullCustomer => {
	const entityScopedProducts = Array.from(
		{ length: ENTITY_SCOPED_PRODUCTS },
		(_, cpIdx) => {
			const cusEnts = Array.from(
				{ length: ENTITY_CUS_ENTS_PER_PRODUCT },
				(_, ceIdx) =>
					customerEntitlements.create({
						id: `ent_scope_ce_${cpIdx}_${ceIdx}`,
						featureId: `ent_feature_${ceIdx}`,
						featureName: `Entity Feature ${ceIdx}`,
						allowance: 1000,
						balance: 500,
						customerProductId: `ent_scope_cp_${cpIdx}`,
						entityFeatureId: `entity_feature_0`,
						entities: {
							entity_0: { id: "entity_0", balance: 500, adjustment: 0 },
						},
					}),
			);

			return customerProducts.create({
				id: `ent_scope_cp_${cpIdx}`,
				productId: `prod_ent_scope_${cpIdx}`,
				customerEntitlements: cusEnts,
				internalEntityId: "internal_entity_0",
				entityId: "entity_0",
			});
		},
	);

	const inheritedProducts = Array.from(
		{ length: ENTITY_INHERITED_PRODUCTS },
		(_, cpIdx) => {
			const cusEnts = Array.from(
				{ length: ENTITY_CUS_ENTS_PER_PRODUCT },
				(_, ceIdx) =>
					customerEntitlements.create({
						id: `ent_inherit_ce_${cpIdx}_${ceIdx}`,
						featureId: `cus_feature_${ceIdx}`,
						featureName: `Customer Feature ${ceIdx}`,
						allowance: 2000,
						balance: 1000,
						customerProductId: `ent_inherit_cp_${cpIdx}`,
					}),
			);

			return customerProducts.create({
				id: `ent_inherit_cp_${cpIdx}`,
				productId: `prod_cus_level_${cpIdx}`,
				customerEntitlements: cusEnts,
			});
		},
	);

	const allProducts = [...entityScopedProducts, ...inheritedProducts];

	const extraCustomerEntitlements = Array.from(
		{ length: ENTITY_EXTRA_CUS_ENTS },
		(_, i) =>
			customerEntitlements.create({
				id: `ent_extra_ce_${i}`,
				featureId: `extra_feature_${i}`,
				featureName: `Extra Feature ${i}`,
				allowance: 500,
				balance: 250,
				customerProductId: undefined,
			}),
	);
	for (const extraCusEnt of extraCustomerEntitlements) {
		extraCusEnt.customer_product_id = null as unknown as string;
	}

	return {
		...customers.create({ customerProducts: allProducts }),
		id: CUSTOMER_ID,
		org_id: ORG_ID,
		env: ENV,
		entities: [],
		extra_customer_entitlements: extraCustomerEntitlements,
	};
};

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

type SlowlogEntry = [
	id: number,
	timestamp: number,
	durationMicros: number,
	command: string[],
	clientIp: string,
	clientName: string,
];

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

const fmtMs = (ms: number) => `${ms.toFixed(2)}ms`;

const seedCache = async ({
	fixture,
	cacheKey,
}: {
	fixture: FullCustomer;
	cacheKey: string;
}) => {
	const pathIndexEntries = buildPathIndex({ fullCustomer: fixture });
	await redis.setFullCustomerCache(
		cacheKey,
		ORG_ID,
		ENV,
		CUSTOMER_ID,
		String(Date.now()),
		String(FULL_CUSTOMER_CACHE_TTL_SECONDS),
		JSON.stringify(fixture),
		"true",
		JSON.stringify(pathIndexEntries),
	);
	return pathIndexEntries;
};

const runSlowlogBatch = async ({
	fn,
	iterations,
	filterCommand,
}: {
	fn: () => Promise<void>;
	iterations: number;
	filterCommand: string;
}): Promise<{ e2eTimings: number[]; serverTimings: number[] }> => {
	await redis.call("CONFIG", "SET", "slowlog-log-slower-than", "0");
	await redis.call("CONFIG", "SET", "slowlog-max-len", "1024");
	await redis.call("SLOWLOG", "RESET");

	const e2eTimings: number[] = [];
	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		await fn();
		e2eTimings.push(performance.now() - start);
	}

	const rawEntries = (await redis.call(
		"SLOWLOG",
		"GET",
		"1024",
	)) as SlowlogEntry[];

	const matchingEntries = rawEntries.filter(
		(entry) =>
			entry[3] &&
			(entry[3][0] === filterCommand ||
				entry[3][0] === filterCommand.toLowerCase()),
	);
	const serverTimings = matchingEntries.map((entry) => entry[2] / 1000);

	await redis.call("CONFIG", "SET", "slowlog-log-slower-than", "10000");

	return { e2eTimings, serverTimings };
};

const buildDeductionParams = ({
	iteration,
	entitlementCount,
	fixture,
}: {
	iteration: number;
	entitlementCount: number;
	fixture: FullCustomer;
}) => {
	const totalProducts = fixture.customer_products.length;
	const cusEntsPerProduct =
		fixture.customer_products[0]?.customer_entitlements.length ?? 1;

	const sortedEntitlements = Array.from(
		{ length: entitlementCount },
		(_, idx) => {
			const cpIdx = (iteration * entitlementCount + idx) % totalProducts;
			const ceIdx = (iteration * entitlementCount + idx) % cusEntsPerProduct;
			const cusEnt =
				fixture.customer_products[cpIdx]?.customer_entitlements[ceIdx];
			const entityFeatureId = cusEnt?.entitlement?.entity_feature_id ?? null;

			return {
				customer_entitlement_id: cusEnt?.id ?? `fallback_ce_${idx}`,
				credit_cost: 1,
				feature_id: cusEnt?.feature_id ?? `feature_${ceIdx}`,
				entity_feature_id: entityFeatureId,
				usage_allowed: true,
				min_balance: null,
				max_balance: null,
			};
		},
	);

	return {
		org_id: ORG_ID,
		env: ENV,
		customer_id: CUSTOMER_ID,
		sorted_entitlements: sortedEntitlements,
		spend_limit_by_feature_id: null,
		usage_based_cus_ent_ids_by_feature_id: null,
		amount_to_deduct: 1,
		target_balance: null,
		target_entity_id: null,
		rollovers: null,
		skip_additional_balance: false,
		alter_granted_balance: false,
		overage_behaviour: "allow",
		feature_id: sortedEntitlements[0]?.feature_id ?? "feature_0",
		lock: null,
		unwind_value: null,
		lock_receipt_key: null,
	};
};

// ═══════════════════════════════════════════════════════════════════
// Results collection
// ═══════════════════════════════════════════════════════════════════

type BenchResult = {
	e2e: ReturnType<typeof formatStats>;
	server: ReturnType<typeof formatStats> | null;
};
const results: Record<string, { bounded: BenchResult; entity: BenchResult }> =
	{};

const CUSTOMER_CACHE_KEY = buildFullCustomerCacheKey({
	orgId: ORG_ID,
	env: ENV,
	customerId: CUSTOMER_ID,
});
const CUSTOMER_PATH_IDX_KEY = buildPathIndexKey({
	orgId: ORG_ID,
	env: ENV,
	customerId: CUSTOMER_ID,
});

const ENTITY_CACHE_KEY_PREFIX = `{${ORG_ID}}:${ENV}:fullentity:1.0.0:${CUSTOMER_ID}:entity_0`;
const ENTITY_PATH_IDX_KEY_PREFIX = `{${ORG_ID}}:${ENV}:fullentity:pathidx:${CUSTOMER_ID}:entity_0`;

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

describe(
	chalk.blueBright("V2 Cache Performance: Bounded FullCustomer vs FullEntity"),
	() => {
		const boundedFixture = buildBoundedFullCustomer();
		const entityFixture = buildFullEntity();

		test("fixture sizes", () => {
			const boundedSize = JSON.stringify(boundedFixture).length;
			const entitySize = JSON.stringify(entityFixture).length;
			console.log(chalk.bold("\n  ─── Fixture Sizes ───"));
			console.log(
				`  Bounded FullCustomer: ${(boundedSize / 1024).toFixed(1)} KB  (${BOUNDED_CUSTOMER_PRODUCTS} products, ${BOUNDED_CUSTOMER_PRODUCTS * BOUNDED_CUSTOMER_CUS_ENTS_PER_PRODUCT} cusEnts, ${BOUNDED_CUSTOMER_ENTITY_COUNT} entities)`,
			);
			console.log(
				`  FullEntity:           ${(entitySize / 1024).toFixed(1)} KB  (${ENTITY_SCOPED_PRODUCTS + ENTITY_INHERITED_PRODUCTS} products, ${(ENTITY_SCOPED_PRODUCTS + ENTITY_INHERITED_PRODUCTS) * ENTITY_CUS_ENTS_PER_PRODUCT} cusEnts)`,
			);
		});

		// ── JSON.SET ──

		test("JSON.SET (full write) — Bounded FullCustomer", async () => {
			const serialized = JSON.stringify(boundedFixture);
			const { e2eTimings, serverTimings } = await runSlowlogBatch({
				fn: async () => {
					await redis.call("JSON.SET", CUSTOMER_CACHE_KEY, ".", serialized);
				},
				iterations: ITERATIONS,
				filterCommand: "JSON.SET",
			});
			results["JSON.SET"] = {
				...results["JSON.SET"],
				bounded: {
					e2e: formatStats(e2eTimings),
					server: serverTimings.length > 0 ? formatStats(serverTimings) : null,
				},
			} as (typeof results)["JSON.SET"];
		});

		test("JSON.SET (full write) — FullEntity", async () => {
			const serialized = JSON.stringify(entityFixture);
			const { e2eTimings, serverTimings } = await runSlowlogBatch({
				fn: async () => {
					await redis.call(
						"JSON.SET",
						ENTITY_CACHE_KEY_PREFIX,
						".",
						serialized,
					);
				},
				iterations: ITERATIONS,
				filterCommand: "JSON.SET",
			});
			results["JSON.SET"] = {
				...results["JSON.SET"],
				entity: {
					e2e: formatStats(e2eTimings),
					server: serverTimings.length > 0 ? formatStats(serverTimings) : null,
				},
			} as (typeof results)["JSON.SET"];
		});

		// ── JSON.GET ──

		test("JSON.GET (full read + parse) — Bounded FullCustomer", async () => {
			await redis.call(
				"JSON.SET",
				CUSTOMER_CACHE_KEY,
				".",
				JSON.stringify(boundedFixture),
			);

			const { e2eTimings, serverTimings } = await runSlowlogBatch({
				fn: async () => {
					const raw = (await redis.call(
						"JSON.GET",
						CUSTOMER_CACHE_KEY,
					)) as string;
					expect(raw).toBeTruthy();
					JSON.parse(raw);
				},
				iterations: ITERATIONS,
				filterCommand: "JSON.GET",
			});
			results["JSON.GET"] = {
				...results["JSON.GET"],
				bounded: {
					e2e: formatStats(e2eTimings),
					server: serverTimings.length > 0 ? formatStats(serverTimings) : null,
				},
			} as (typeof results)["JSON.GET"];
		});

		test("JSON.GET (full read + parse) — FullEntity", async () => {
			await redis.call(
				"JSON.SET",
				ENTITY_CACHE_KEY_PREFIX,
				".",
				JSON.stringify(entityFixture),
			);

			const { e2eTimings, serverTimings } = await runSlowlogBatch({
				fn: async () => {
					const raw = (await redis.call(
						"JSON.GET",
						ENTITY_CACHE_KEY_PREFIX,
					)) as string;
					expect(raw).toBeTruthy();
					JSON.parse(raw);
				},
				iterations: ITERATIONS,
				filterCommand: "JSON.GET",
			});
			results["JSON.GET"] = {
				...results["JSON.GET"],
				entity: {
					e2e: formatStats(e2eTimings),
					server: serverTimings.length > 0 ? formatStats(serverTimings) : null,
				},
			} as (typeof results)["JSON.GET"];
		});

		// ── setFullCustomerCache (Lua) ──

		test("setFullCustomerCache (Lua) — Bounded FullCustomer", async () => {
			const serialized = JSON.stringify(boundedFixture);
			const pathIndexEntries = buildPathIndex({ fullCustomer: boundedFixture });
			const pathIndexJson = JSON.stringify(pathIndexEntries);

			const { e2eTimings, serverTimings } = await runSlowlogBatch({
				fn: async () => {
					await redis.setFullCustomerCache(
						CUSTOMER_CACHE_KEY,
						ORG_ID,
						ENV,
						CUSTOMER_ID,
						String(Date.now()),
						String(FULL_CUSTOMER_CACHE_TTL_SECONDS),
						serialized,
						"true",
						pathIndexJson,
					);
				},
				iterations: ITERATIONS,
				filterCommand: "EVALSHA",
			});
			results["setCache (Lua)"] = {
				...results["setCache (Lua)"],
				bounded: {
					e2e: formatStats(e2eTimings),
					server: serverTimings.length > 0 ? formatStats(serverTimings) : null,
				},
			} as (typeof results)["setCache (Lua)"];
		});

		test("setFullCustomerCache (Lua) — FullEntity", async () => {
			const serialized = JSON.stringify(entityFixture);
			const pathIndexEntries = buildPathIndex({ fullCustomer: entityFixture });
			const pathIndexJson = JSON.stringify(pathIndexEntries);

			const { e2eTimings, serverTimings } = await runSlowlogBatch({
				fn: async () => {
					await redis.setFullCustomerCache(
						ENTITY_CACHE_KEY_PREFIX,
						ORG_ID,
						ENV,
						CUSTOMER_ID,
						String(Date.now()),
						String(FULL_CUSTOMER_CACHE_TTL_SECONDS),
						serialized,
						"true",
						pathIndexJson,
					);
				},
				iterations: ITERATIONS,
				filterCommand: "EVALSHA",
			});
			results["setCache (Lua)"] = {
				...results["setCache (Lua)"],
				entity: {
					e2e: formatStats(e2eTimings),
					server: serverTimings.length > 0 ? formatStats(serverTimings) : null,
				},
			} as (typeof results)["setCache (Lua)"];
		});

		// ── Deduction benchmarks ──

		for (const entCount of [1, 5, 10]) {
			const label = `deduct ${entCount} ent`;

			test(`deductFromCustomerEntitlements (${entCount} ent) — Bounded FullCustomer`, async () => {
				await seedCache({
					fixture: boundedFixture,
					cacheKey: CUSTOMER_CACHE_KEY,
				});

				const { e2eTimings, serverTimings } = await runSlowlogBatch({
					fn: async () => {
						const params = buildDeductionParams({
							iteration: Math.floor(Math.random() * 1000),
							entitlementCount: entCount,
							fixture: boundedFixture,
						});
						const result = await redis.deductFromCustomerEntitlements(
							CUSTOMER_CACHE_KEY,
							JSON.stringify(params),
						);
						const parsed = JSON.parse(result);
						expect(parsed.error).toBeNull();
					},
					iterations: ITERATIONS,
					filterCommand: "EVALSHA",
				});

				results[label] = {
					...results[label],
					bounded: {
						e2e: formatStats(e2eTimings),
						server:
							serverTimings.length > 0 ? formatStats(serverTimings) : null,
					},
				} as (typeof results)[typeof label];
			});

			test(`deductFromCustomerEntitlements (${entCount} ent) — FullEntity`, async () => {
				await seedCache({
					fixture: entityFixture,
					cacheKey: ENTITY_CACHE_KEY_PREFIX,
				});

				const { e2eTimings, serverTimings } = await runSlowlogBatch({
					fn: async () => {
						const params = buildDeductionParams({
							iteration: Math.floor(Math.random() * 1000),
							entitlementCount: entCount,
							fixture: entityFixture,
						});
						const result = await redis.deductFromCustomerEntitlements(
							ENTITY_CACHE_KEY_PREFIX,
							JSON.stringify(params),
						);
						const parsed = JSON.parse(result);
						expect(parsed.error).toBeNull();
					},
					iterations: ITERATIONS,
					filterCommand: "EVALSHA",
				});

				results[label] = {
					...results[label],
					entity: {
						e2e: formatStats(e2eTimings),
						server:
							serverTimings.length > 0 ? formatStats(serverTimings) : null,
					},
				} as (typeof results)[typeof label];
			});
		}

		// ── Comparison table ──

		test("print comparison table", async () => {
			const pad = (str: string, len: number) => str.padStart(len);

			console.log(
				chalk.bold(
					"\n  ─── V2 Cache Performance: Bounded FullCustomer vs FullEntity ───",
				),
			);
			console.log(
				`  │ ${"Operation".padEnd(24)} │ ${"FullCustomer (server)".padEnd(22)} │ ${"FullEntity (server)".padEnd(22)} │`,
			);
			console.log(`  │${"─".repeat(25)}│${"─".repeat(23)}│${"─".repeat(23)}│`);

			const operations = [
				"JSON.SET",
				"JSON.GET",
				"setCache (Lua)",
				"deduct 1 ent",
				"deduct 5 ent",
				"deduct 10 ent",
			];

			for (const op of operations) {
				const entry = results[op];
				if (!entry) continue;

				const boundedVal = entry.bounded?.server
					? pad(fmtMs(entry.bounded.server.avg), 12)
					: pad("N/A", 12);
				const entityVal = entry.entity?.server
					? pad(fmtMs(entry.entity.server.avg), 12)
					: pad("N/A", 12);

				console.log(
					`  │ ${op.padEnd(24)} │ ${boundedVal.padEnd(22)} │ ${entityVal.padEnd(22)} │`,
				);
			}

			// Cleanup test keys
			await redis.call("DEL", CUSTOMER_CACHE_KEY);
			await redis.call("DEL", CUSTOMER_PATH_IDX_KEY);
			await redis.call("DEL", ENTITY_CACHE_KEY_PREFIX);
			await redis.call("DEL", ENTITY_PATH_IDX_KEY_PREFIX);
		});
	},
);
