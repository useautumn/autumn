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
	ADJUST_CUSTOMER_ENTITLEMENT_BALANCE_SCRIPT,
	APPEND_ENTITY_TO_CUSTOMER_SCRIPT,
	BATCH_DELETE_FULL_CUSTOMER_CACHE_SCRIPT,
	CLAIM_LOCK_RECEIPT_SCRIPT,
	DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT,
	DELETE_FULL_CUSTOMER_CACHE_SCRIPT,
	RESET_CUSTOMER_ENTITLEMENTS_SCRIPT,
	SET_FULL_CUSTOMER_CACHE_SCRIPT,
	UPDATE_CUSTOMER_DATA_SCRIPT,
	UPDATE_CUSTOMER_ENTITLEMENTS_SCRIPT,
	UPDATE_CUSTOMER_PRODUCT_SCRIPT,
	UPDATE_ENTITY_IN_CUSTOMER_SCRIPT,
	UPSERT_INVOICE_IN_CUSTOMER_SCRIPT,
} from "../../_luaScriptsV2/luaScriptsV2.js";
import { instrumentRedis } from "../../utils/otel/instrumentRedis.js";
import { getActiveRedis, initFailover } from "./redisFailover.js";

// if (!process.env.CACHE_URL) {
// 	throw new Error("CACHE_URL (redis) is not set");
// }

// Region constants
const REGION_US_EAST_2 = "us-east-2";
const REGION_US_WEST_2 = "us-west-2";

// All configured regions
const ALL_REGIONS = [REGION_US_EAST_2, REGION_US_WEST_2] as const;

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

/** Wait for a Redis instance to be ready */
const waitForRedisReady = (
	instance: Redis,
	region: string,
	timeoutMs = 10000,
): Promise<void> => {
	return new Promise((resolve, reject) => {
		if (instance.status === "ready") {
			resolve();
			return;
		}

		const timeout = setTimeout(() => {
			reject(new Error(`Redis connection timeout for region ${region}`));
		}, timeoutMs);

		instance.once("ready", () => {
			clearTimeout(timeout);
			console.log(`[Redis] ${region}: connected`);
			resolve();
		});

		instance.once("error", (err) => {
			clearTimeout(timeout);
			reject(err);
		});
	});
};

/** Pre-warm all regional Redis connections. Call on startup before processing requests. */
export const warmupRegionalRedis = async (): Promise<void> => {
	const regions = getConfiguredRegions();
	console.log(
		`[Redis] Warming up connections for ${regions.length} regions...`,
	);

	const warmupPromises = regions.map(async (region) => {
		try {
			const instance = getRegionalRedis(region);
			await waitForRedisReady(instance, region);
		} catch (error) {
			console.error(`[Redis] ${region}: warmup failed -`, error);
			// Don't throw - allow startup to continue even if one region fails
		}
	});

	await Promise.all(warmupPromises);
	console.log(`[Redis] Warmup complete`);
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

	redisInstance.defineCommand("setFullCustomerCache", {
		numberOfKeys: 2,
		lua: SET_FULL_CUSTOMER_CACHE_SCRIPT,
	});

	redisInstance.defineCommand("resetCustomerEntitlements", {
		numberOfKeys: 1,
		lua: RESET_CUSTOMER_ENTITLEMENTS_SCRIPT,
	});

	redisInstance.defineCommand("updateCustomerEntitlements", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_ENTITLEMENTS_SCRIPT,
	});

	redisInstance.defineCommand("updateCustomerData", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_DATA_SCRIPT,
	});

	redisInstance.defineCommand("appendEntityToCustomer", {
		numberOfKeys: 1,
		lua: APPEND_ENTITY_TO_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("updateEntityInCustomer", {
		numberOfKeys: 1,
		lua: UPDATE_ENTITY_IN_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("upsertInvoiceInCustomer", {
		numberOfKeys: 1,
		lua: UPSERT_INVOICE_IN_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("adjustCustomerEntitlementBalance", {
		numberOfKeys: 1,
		lua: ADJUST_CUSTOMER_ENTITLEMENT_BALANCE_SCRIPT,
	});

	redisInstance.defineCommand("updateCustomerProduct", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_PRODUCT_SCRIPT,
	});

	redisInstance.defineCommand("claimLockReceipt", {
		numberOfKeys: 1,
		lua: CLAIM_LOCK_RECEIPT_SCRIPT,
	});

	redisInstance.on("error", (error) => {
		console.error(`[Redis] Connection error:`, error.message);
	});

	return redisInstance;
};

/** Create a Redis connection for a specific region */
const createRedisConnection = ({
	cacheUrl,
	region,
}: {
	cacheUrl: string;
	region: string;
}): Redis => {
	const instance = new Redis(cacheUrl, {
		tls: process.env.CACHE_CERT ? { ca: process.env.CACHE_CERT } : undefined,
		family: 4,
		keepAlive: 10000,
	});
	// instrumentRedis must run first so its defineCommand patch
	// is in place when configureRedisInstance registers Lua commands.
	instrumentRedis({ redis: instance, region });
	configureRedisInstance(instance);
	return instance;
};

// Primary Redis instance (current region or default)
const primaryCacheUrl =
	regionToCacheUrl[currentRegion] || process.env.CACHE_URL;

if (primaryCacheUrl && regionToCacheUrl[currentRegion]) {
	console.log(`Using regional cache: ${currentRegion}`);
}

const primaryRedis = createRedisConnection({
	cacheUrl: primaryCacheUrl!,
	region: currentRegion,
});

// Eagerly create failover instance (other region) for automatic failover
const failoverRegion =
	ALL_REGIONS.find((r) => r !== currentRegion && regionToCacheUrl[r]) ?? null;

let failoverRedis: Redis | null = null;
if (failoverRegion) {
	const failoverUrl = regionToCacheUrl[failoverRegion]!;
	// Only create a separate instance if it's actually a different server
	if (failoverUrl !== primaryCacheUrl) {
		failoverRedis = createRedisConnection({
			cacheUrl: failoverUrl,
			region: failoverRegion,
		});
	}
}

// Initialize failover — monitors primary health and swaps `redis` automatically
initFailover({
	primary: primaryRedis,
	failover: failoverRedis,
	failoverRegion,
	currentRegion,
});

/**
 * The active Redis instance. All consumer code imports this.
 * Normally points to the primary (current region). During a primary outage,
 * the failover module swaps this to the other region's instance automatically.
 *
 * This is a `let` so it's a live ES module binding — reassignments here
 * are visible to all importers on their next access.
 */
export let redis: Redis = primaryRedis;

// Subscribe to failover state changes — keep the `redis` export in sync.
// We do this here (not in redisFailover.ts) because the module binding
// can only be reassigned in the module that declares it.
const syncRedisBinding = () => {
	const active = getActiveRedis();
	if (redis !== active) {
		redis = active;
	}
};

primaryRedis.on("error", syncRedisBinding);
primaryRedis.on("ready", syncRedisBinding);
if (failoverRedis) {
	failoverRedis.on("error", syncRedisBinding);
	failoverRedis.on("ready", syncRedisBinding);
}
// Also poll periodically to catch any edge cases with event timing
setInterval(syncRedisBinding, 2000);

// Lazy-loaded regional Redis instances for cross-region sync
const regionalRedisInstances: Map<string, Redis> = new Map();

// Pre-populate with eagerly created instances
if (failoverRedis && failoverRegion) {
	regionalRedisInstances.set(failoverRegion, failoverRedis);
}

/** Get Redis instance for a specific region (lazy-loaded) */
export const getRegionalRedis = (region: string): Redis => {
	// Always return the actual primary for the current region (not the active/failover)
	// so cross-region sync logic isn't affected by failover state.
	if (region === currentRegion) {
		return primaryRedis;
	}

	// Get the cache URL for the requested region
	const cacheUrl = regionToCacheUrl[region];

	// If no cache URL configured, fall back to primary
	if (!cacheUrl) {
		console.warn(
			`No cache URL configured for region ${region}, falling back to primary`,
		);
		return primaryRedis;
	}

	// If the cache URL is the same as primary, return primary instance
	if (cacheUrl === primaryCacheUrl) {
		return primaryRedis;
	}

	// Check if we already have a connection for this region
	let regionalInstance = regionalRedisInstances.get(region);
	if (regionalInstance) {
		return regionalInstance;
	}

	// Create new connection for the requested region
	console.log(`Creating Redis connection for region: ${region}`);
	regionalInstance = createRedisConnection({ cacheUrl, region });
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
			skipGuard: string,
		): Promise<"SKIPPED" | "DELETED" | "NOT_FOUND">;
		batchDeleteFullCustomerCache(
			guardTimestamp: string,
			guardTtl: string,
			customersJson: string,
		): Promise<string>;
		setFullCustomerCache(
			guardKey: string,
			cacheKey: string,
			fetchTimeMs: string,
			cacheTtl: string,
			serializedData: string,
			overwrite: string,
		): Promise<"STALE_WRITE" | "CACHE_EXISTS" | "OK">;
		resetCustomerEntitlements(
			cacheKey: string,
			paramsJson: string,
		): Promise<string>;
		updateCustomerEntitlements(
			cacheKey: string,
			paramsJson: string,
		): Promise<string>;
		adjustCustomerEntitlementBalance(
			cacheKey: string,
			paramsJson: string,
		): Promise<string>;
		updateCustomerData(cacheKey: string, paramsJson: string): Promise<string>;
		appendEntityToCustomer(
			cacheKey: string,
			entityJson: string,
		): Promise<string>;
		updateEntityInCustomer(
			cacheKey: string,
			paramsJson: string,
		): Promise<string>;
		upsertInvoiceInCustomer(
			cacheKey: string,
			invoiceJson: string,
		): Promise<string>;
		updateCustomerProduct(
			cacheKey: string,
			paramsJson: string,
		): Promise<string>;
		claimLockReceipt(lockReceiptKey: string): Promise<string | null>;
	}
}

/** Get the primary Redis instance (us-west-2) to avoid replication lag issues */
export const getPrimaryRedis = () => getRegionalRedis(REGION_US_WEST_2);
