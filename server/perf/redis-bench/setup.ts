/**
 * Redis benchmark setup — seeds a large FullCustomer (100 entities x 10 cusEnts)
 * directly into Redis and creates a minimal customer via the Autumn API so that
 * check/track endpoints can resolve it.
 *
 * Run: cd server && bun perf/redis-bench/setup.ts
 */

import { loadLocalEnv } from "../../src/utils/envUtils.js";
loadLocalEnv();

import { AppEnv, ApiVersion, type FullCustomer } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { entities as entityFixtures } from "@tests/utils/fixtures/db/entities.js";
import { buildPathIndex } from "@/internal/customers/cache/pathIndex/buildPathIndex.js";
import {
	buildFullCustomerCacheKey,
	FULL_CUSTOMER_CACHE_TTL_SECONDS,
} from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { redis } from "@/external/redis/initRedis.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const ENTITY_COUNT = 100;
const CUS_ENTS_PER_PRODUCT = 10;
const ORG_ID = process.env.TESTS_ORG_ID || "org_perf_test";
const ENV = AppEnv.Sandbox;
const CUSTOMER_ID = "redis-bench-large-cus";
const FEATURE_ID = "feature_0";

async function main() {
	console.log("=== Redis Benchmark Setup ===\n");

	// 1. Build large FullCustomer
	console.log(
		`Building FullCustomer: ${ENTITY_COUNT} entities x ${CUS_ENTS_PER_PRODUCT} cusEnts = ${ENTITY_COUNT * CUS_ENTS_PER_PRODUCT} total cusEnts`,
	);

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

	const fullCustomer = {
		...customers.create({ customerProducts: cusProducts }),
		id: CUSTOMER_ID,
		org_id: ORG_ID,
		env: ENV,
		config: {},
		entities: entitiesList,
		extra_customer_entitlements: [],
	} as FullCustomer;

	const serialized = JSON.stringify(fullCustomer);
	console.log(
		`  Serialized size: ${(serialized.length / 1024 / 1024).toFixed(2)} MB`,
	);

	// 2. Write to Redis
	const cacheKey = buildFullCustomerCacheKey({
		orgId: ORG_ID,
		env: ENV,
		customerId: CUSTOMER_ID,
	});

	const pathIndexEntries = buildPathIndex({ fullCustomer });
	const pathIndexJson = JSON.stringify(pathIndexEntries);
	console.log(
		`  Path index: ${Object.keys(pathIndexEntries).length} entries, ${(pathIndexJson.length / 1024).toFixed(2)} KB`,
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

	console.log(`  Redis setFullCustomerCache result: ${result}`);

	// 3. Create customer via Autumn API (so check/track endpoints work)
	const secretKey = process.env.UNIT_TEST_AUTUMN_SECRET_KEY;
	if (secretKey) {
		console.log("\nCreating customer via Autumn API...");
		const autumn = new AutumnInt({
			version: ApiVersion.V1_2,
			secretKey,
		});

		try {
			await autumn.customers.delete(CUSTOMER_ID);
		} catch {
			// May not exist yet
		}

		try {
			await autumn.customers.create({
				id: CUSTOMER_ID,
				name: "Redis Bench Large Customer",
				email: "redis-bench@test.local",
			});
			console.log(`  Created customer: ${CUSTOMER_ID}`);
		} catch (error) {
			console.warn(`  Could not create customer via API: ${error}`);
		}
	} else {
		console.log(
			"\n  Skipping Autumn API customer creation (UNIT_TEST_AUTUMN_SECRET_KEY not set)",
		);
	}

	console.log(`\n=== Setup complete ===`);
	console.log(`  Customer ID: ${CUSTOMER_ID}`);
	console.log(`  Feature ID: ${FEATURE_ID}`);
	console.log(`  Entity IDs: entity_0 through entity_${ENTITY_COUNT - 1}`);
}

main()
	.catch((error) => {
		console.error("Setup failed:", error);
		process.exit(1);
	})
	.finally(() => {
		process.exit(0);
	});
