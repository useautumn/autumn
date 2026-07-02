import { AppEnv } from "@autumn/shared";
import { initDrizzle } from "./src/db/initDrizzle.js";
import { ApiKeyPrefix, createKey, hashApiKey } from "./src/internal/dev/api-keys/apiKeyUtils.js";
import { FeatureService } from "./src/internal/features/FeatureService.js";
import { clearOrgCache } from "./src/internal/orgs/orgUtils/clearOrgCache.js";
import { generateId } from "./src/utils/genUtils.js";
import { redis, currentRegion, getConfiguredRegions } from "./src/external/redis/initRedis.js";

const TEST_ORG_ID = "up14IBMvCJ8XP0YgSskSlzpumxqRqyrb"; // From database
const ENV = AppEnv.Sandbox;

async function testCacheClear() {
	const { db } = initDrizzle();
	
	console.log("\n=== REDIS CONFIGURATION ===");
	console.log(`Current region: ${currentRegion}`);
	console.log(`Configured regions: ${getConfiguredRegions().join(', ')}`);
	console.log(`Global redis status: ${redis.status}`);
	
	console.log("\n=== STEP 1: Create test API key ===");
	const secretKey = await createKey({
		db,
		env: ENV,
		name: "Cache Test Key",
		orgId: TEST_ORG_ID,
		prefix: ApiKeyPrefix.Sandbox,
		meta: { test: true },
	});
	const hashedKey = hashApiKey(secretKey);
	console.log(`Created key: ${secretKey.substring(0, 20)}...`);
	console.log(`Hashed: ${hashedKey.substring(0, 20)}...`);
	
	console.log("\n=== STEP 2: Cache some data ===");
	const cacheKey = `secret_key:${hashedKey}`;
	const testData = { features: [{ id: "test", model_markups: { "test-model": { markup: 0 } } }] };
	await redis.set(cacheKey, JSON.stringify(testData), "EX", 3600);
	console.log(`Cached data with key: ${cacheKey}`);
	
	console.log("\n=== STEP 3: Verify cache exists ===");
	const cached = await redis.get(cacheKey);
	console.log(`Cache hit: ${cached !== null}`);
	if (cached) {
		console.log(`Cached features: ${JSON.parse(cached).features?.length || 0}`);
	}
	
	console.log("\n=== STEP 4: Call clearOrgCache ===");
	await clearOrgCache({
		db,
		orgId: TEST_ORG_ID,
		env: ENV,
	});
	
	console.log("\n=== STEP 5: Check if cache was cleared ===");
	const afterClear = await redis.get(cacheKey);
	console.log(`Cache after clear: ${afterClear !== null ? "STILL EXISTS" : "CLEARED"}`);
	
	if (afterClear !== null) {
		console.log("\n❌ CACHE WAS NOT CLEARED - This confirms the bug!");
	} else {
		console.log("\n✅ Cache was cleared successfully");
	}
	
	// Cleanup
	await db.execute(`DELETE FROM api_keys WHERE hashed_key = '${hashedKey}'`);
	process.exit(afterClear !== null ? 1 : 0);
}

testCacheClear().catch(console.error);
