import { Redis } from "ioredis";
import {
	BATCH_DELETE_CUSTOMERS_SCRIPT,
	DELETE_CUSTOMER_SCRIPT,
	GET_CUSTOMER_SCRIPT,
	GET_ENTITY_SCRIPT,
	getBatchDeductionScript,
	SET_CUSTOMER_DETAILS_SCRIPT,
	SET_CUSTOMER_SCRIPT,
	SET_ENTITIES_BATCH_SCRIPT,
	SET_ENTITY_PRODUCTS_SCRIPT,
	SET_GRANTED_BALANCE_SCRIPT,
	SET_INVOICES_SCRIPT,
	SET_SUBSCRIPTIONS_SCRIPT,
} from "../../_luaScripts/luaScripts.js";
import {
	BATCH_DELETE_FULL_CUSTOMER_CACHE_SCRIPT,
	DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT,
	DELETE_FULL_CUSTOMER_CACHE_SCRIPT,
} from "../../_luaScriptsV2/luaScriptsV2.js";

if (!process.env.CACHE_URL) {
	throw new Error("CACHE_URL (redis) is not set");
}

// Region constants
export const REGION_US_EAST_2 = "us-east-2";
export const REGION_US_WEST_2 = "us-west-2";

// All configured regions
export const ALL_REGIONS = [REGION_US_EAST_2, REGION_US_WEST_2] as const;

// Current region this instance is running in
export const currentRegion = process.env.AWS_REGION || REGION_US_WEST_2;

// Map of region to cache URL
const regionToCacheUrl: Record<string, string | undefined> = {
	[REGION_US_EAST_2]: process.env.CACHE_URL_US_EAST,
	[REGION_US_WEST_2]: process.env.CACHE_URL, // Default/us-west-2 URL
};

/** Get all regions that have configured cache URLs */
export const getConfiguredRegions = (): string[] => {
	return ALL_REGIONS.filter((region) => regionToCacheUrl[region]);
};

/** Configure a Redis instance with custom commands */
const configureRedisInstance = (redisInstance: Redis): Redis => {
	const batchDeductionScript = getBatchDeductionScript();

	redisInstance.defineCommand("batchDeduction", {
		numberOfKeys: 0,
		lua: batchDeductionScript,
	});

	redisInstance.defineCommand("getCustomer", {
		numberOfKeys: 0,
		lua: GET_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("setCustomer", {
		numberOfKeys: 0,
		lua: SET_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("setEntitiesBatch", {
		numberOfKeys: 0,
		lua: SET_ENTITIES_BATCH_SCRIPT,
	});

	redisInstance.defineCommand("getEntity", {
		numberOfKeys: 0,
		lua: GET_ENTITY_SCRIPT,
	});

	redisInstance.defineCommand("setSubscriptions", {
		numberOfKeys: 0,
		lua: SET_SUBSCRIPTIONS_SCRIPT,
	});

	redisInstance.defineCommand("setEntityProducts", {
		numberOfKeys: 0,
		lua: SET_ENTITY_PRODUCTS_SCRIPT,
	});

	redisInstance.defineCommand("setInvoices", {
		numberOfKeys: 0,
		lua: SET_INVOICES_SCRIPT,
	});

	redisInstance.defineCommand("setCustomerDetails", {
		numberOfKeys: 0,
		lua: SET_CUSTOMER_DETAILS_SCRIPT,
	});

	redisInstance.defineCommand("setGrantedBalance", {
		numberOfKeys: 0,
		lua: SET_GRANTED_BALANCE_SCRIPT,
	});

	redisInstance.defineCommand("deleteCustomer", {
		numberOfKeys: 0,
		lua: DELETE_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("batchDeleteCustomers", {
		numberOfKeys: 0,
		lua: BATCH_DELETE_CUSTOMERS_SCRIPT,
	});

	redisInstance.defineCommand("deductFromCustomerEntitlements", {
		numberOfKeys: 1,
		lua: DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT,
	});

	redisInstance.defineCommand("deleteFullCustomerCache", {
		numberOfKeys: 3,
		lua: DELETE_FULL_CUSTOMER_CACHE_SCRIPT,
	});

	redisInstance.defineCommand("batchDeleteFullCustomerCache", {
		numberOfKeys: 0,
		lua: BATCH_DELETE_FULL_CUSTOMER_CACHE_SCRIPT,
	});

	// biome-ignore lint/correctness/noUnusedFunctionParameters: Might uncomment this back in in the future
	redisInstance.on("error", (error) => {
		// logger.error(`redis (cache) error: ${error.message}`);
	});

	return redisInstance;
};

/** Create a Redis connection for a specific region */
const createRedisConnection = (cacheUrl: string): Redis => {
	const instance = new Redis(cacheUrl, {
		tls: process.env.CACHE_CERT ? { ca: process.env.CACHE_CERT } : undefined,
		family: 4,
		keepAlive: 10000,
	});
	return configureRedisInstance(instance);
};

// Primary Redis instance (current region or default)
const primaryCacheUrl =
	regionToCacheUrl[currentRegion] || process.env.CACHE_URL;

if (primaryCacheUrl && regionToCacheUrl[currentRegion]) {
	console.log(`Using regional cache: ${currentRegion}`);
}

const redis = createRedisConnection(primaryCacheUrl!);

// Lazy-loaded regional Redis instances for cross-region sync
const regionalRedisInstances: Map<string, Redis> = new Map();

/** Get Redis instance for a specific region (lazy-loaded) */
export const getRegionalRedis = (region: string): Redis => {
	// If requesting current region, return primary instance
	if (region === currentRegion) {
		return redis;
	}

	// Get the cache URL for the requested region
	const cacheUrl = regionToCacheUrl[region];

	// If no cache URL configured, fall back to primary
	if (!cacheUrl) {
		console.warn(
			`No cache URL configured for region ${region}, falling back to primary`,
		);
		return redis;
	}

	// If the cache URL is the same as primary, return primary instance
	// (avoids creating duplicate connections to the same server)
	if (cacheUrl === primaryCacheUrl) {
		return redis;
	}

	// Check if we already have a connection for this region
	let regionalInstance = regionalRedisInstances.get(region);
	if (regionalInstance) {
		return regionalInstance;
	}

	// Create new connection for the requested region
	console.log(`Creating Redis connection for region: ${region}`);
	regionalInstance = createRedisConnection(cacheUrl);
	regionalRedisInstances.set(region, regionalInstance);

	return regionalInstance;
};

// Add type definitions
declare module "ioredis" {
	interface RedisCommander {
		batchDeduction(
			requestsJson: string,
			orgId: string,
			env: string,
			customerId: string,
			adjustGrantedBalance?: string,
		): Promise<string>;
		getCustomer(
			cacheCustomerVersion: string,
			orgId: string,
			env: string,
			customerId: string,
			skipEntityMerge: string,
		): Promise<string>;
		setCustomer(
			customerData: string,
			orgId: string,
			env: string,
			customerId: string,
			fetchTimeMs: string, // Timestamp when data was fetched from Postgres (for stale write prevention)
		): Promise<string>;
		setEntitiesBatch(
			entityBatch: string,
			orgId: string,
			env: string,
		): Promise<string>;
		getEntity(
			cacheCustomerVersion: string,
			orgId: string,
			env: string,
			customerId: string,
			entityId: string,
			skipCustomerMerge: string,
		): Promise<string>;
		setSubscriptions(
			subscriptionsJson: string,
			scheduledSubscriptionsJson: string,
			orgId: string,
			env: string,
			customerId: string,
		): Promise<string>;
		setEntityProducts(
			subscriptionsJson: string,
			scheduledSubscriptionsJson: string,
			orgId: string,
			env: string,
			customerId: string,
			entityId: string,
		): Promise<string>;
		setInvoices(
			invoicesJson: string,
			orgId: string,
			env: string,
			customerId: string,
		): Promise<string>;
		setCustomerDetails(
			updatesJson: string,
			orgId: string,
			env: string,
			customerId: string,
		): Promise<string>;
		setGrantedBalance(
			orgId: string,
			env: string,
			customerId: string,
			customerBalancesJson: string,
			entityBatchJson: string,
		): Promise<string>;
		deleteCustomer(
			cacheCustomerVersion: string,
			orgId: string,
			env: string,
			customerId: string,
		): Promise<number>;
		batchDeleteCustomers(
			cacheCustomerVersion: string,
			customersJson: string,
		): Promise<number>;
		deductFromCustomerEntitlements(
			cacheKey: string,
			paramsJson: string,
		): Promise<string>;
		deleteFullCustomerCache(
			testGuardKey: string,
			guardKey: string,
			cacheKey: string,
			guardTimestamp: string,
			guardTtl: string,
		): Promise<"SKIPPED" | "DELETED" | "NOT_FOUND">;
		batchDeleteFullCustomerCache(
			guardTimestamp: string,
			guardTtl: string,
			customersJson: string,
		): Promise<string>;
	}
}

export { redis };
