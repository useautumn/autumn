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

// if (!process.env.CACHE_URL) {
// 	throw new Error("CACHE_URL (redis) is not set");
// }

// Region constants
const REGION_US_EAST_2 = "us-east-2";
const REGION_US_WEST_2 = "us-west-2";
const REDIS_ERROR_LOG_INTERVAL_MS = 30_000;
const REDIS_PROBE_INTERVAL_MS = 2_000;
const REDIS_PROBE_TIMEOUT_MS = 500;

// All configured regions
const ALL_REGIONS = [REGION_US_EAST_2, REGION_US_WEST_2] as const;

// Current region this instance is running in
export const currentRegion = process.env.AWS_REGION || REGION_US_WEST_2;

const cacheBackupUrl = process.env.CACHE_BACKUP_URL?.trim();
export const hasRedisConfig = Boolean(
	process.env.CACHE_URL ||
		process.env.CACHE_URL_US_EAST ||
		process.env.CACHE_BACKUP_URL?.trim(),
);

// Map of region to cache URL. When CACHE_BACKUP_URL is set, all regions use it (failover / single backup endpoint).
const regionToCacheUrl: Record<string, string | undefined> = cacheBackupUrl
	? {
			[REGION_US_EAST_2]: cacheBackupUrl,
			[REGION_US_WEST_2]: cacheBackupUrl,
		}
	: {
			[REGION_US_EAST_2]: process.env.CACHE_URL_US_EAST,
			[REGION_US_WEST_2]: process.env.CACHE_URL,
		};

/** Get all regions that have configured cache URLs */
export const getConfiguredRegions = (): string[] => {
	return ALL_REGIONS.filter((region) => regionToCacheUrl[region]);
};

type RedisAvailabilityState = "healthy" | "degraded";

type RedisAvailabilitySnapshot = {
	configured: boolean;
	state: RedisAvailabilityState;
	status: string;
};

let redisMonitorInterval: ReturnType<typeof setInterval> | null = null;
let redisTickInFlight = false;

let redisAvailabilityState: RedisAvailabilityState = "degraded";

const withTimeout = async <T>({
	timeoutMs,
	fn,
}: {
	timeoutMs: number;
	fn: () => Promise<T>;
}): Promise<T> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	try {
		return await Promise.race([
			fn(),
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(
					() => reject(new Error(`timed out after ${timeoutMs}ms`)),
					timeoutMs,
				);
				timeoutId.unref?.();
			}),
		]);
	} finally {
		clearTimeout(timeoutId);
	}
};

const attachRedisErrorHandler = ({
	redisInstance,
	label,
	logErrors = true,
}: {
	redisInstance: Redis;
	label: string;
	logErrors?: boolean;
}) => {
	let lastErrorAt = 0;

	redisInstance.on("error", (error) => {
		if (!logErrors) return;

		const now = Date.now();
		if (now - lastErrorAt < REDIS_ERROR_LOG_INTERVAL_MS) return;
		lastErrorAt = now;

		console.error(`[Redis] ${label}:`, error.message);
	});
};

/** Wait for a Redis instance to be ready */
const waitForRedisReady = (
	instance: Redis,
	region: string,
	timeoutMs = 10000,
): Promise<void> => {
	return new Promise((resolve, reject) => {
		if (!hasRedisConfig) {
			resolve();
			return;
		}

		if (instance.status === "ready") {
			resolve();
			return;
		}

		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(`Redis connection timeout for region ${region}`));
		}, timeoutMs);

		const cleanup = () => {
			clearTimeout(timeout);
			instance.off("ready", handleReady);
			instance.off("error", handleError);
		};

		const handleReady = () => {
			cleanup();
			clearTimeout(timeout);
			console.log(`[Redis] ${region}: connected`);
			resolve();
		};

		const handleError = (err: unknown) => {
			cleanup();
			reject(err);
		};

		instance.on("ready", handleReady);
		instance.on("error", handleError);
		void instance.connect().catch(handleError);
	});
};

/** Pre-warm all regional Redis connections. Call on startup before processing requests. */
export const warmupRegionalRedis = async (): Promise<void> => {
	console.time("redis:warmup-total");
	const regions = getConfiguredRegions();
	console.log(
		`[Redis] Warming up connections for ${regions.length} regions...`,
	);

	const warmupPromises = regions.map(async (region) => {
		console.time(`redis:warmup-${region}`);
		try {
			const instance = getRegionalRedis(region);
			await waitForRedisReady(instance, region);
		} catch (error) {
			console.error(`[Redis] ${region}: warmup failed -`, error);
			// Don't throw - allow startup to continue even if one region fails
		}
		console.timeEnd(`redis:warmup-${region}`);
	});

	await Promise.all(warmupPromises);
	console.timeEnd("redis:warmup-total");
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
		numberOfKeys: 1,
		lua: DELETE_FULL_CUSTOMER_CACHE_SCRIPT,
	});

	redisInstance.defineCommand("setFullCustomerCache", {
		numberOfKeys: 1,
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

	attachRedisErrorHandler({
		redisInstance,
		label: "Connection error",
	});

	return redisInstance;
};

/** Create a Redis connection for a specific region */
const getTlsOptions = () =>
	process.env.CACHE_CERT && !cacheBackupUrl
		? { ca: process.env.CACHE_CERT }
		: undefined;

const createRedisConnection = ({
	cacheUrl,
	region,
}: {
	cacheUrl: string;
	region: string;
}): Redis => {
	const instance = new Redis(cacheUrl, {
		connectTimeout: 500,
		tls: getTlsOptions(),
		family: 4,
		keepAlive: 10000,
		enableOfflineQueue: false,
		lazyConnect: true,
		maxRetriesPerRequest: null,
		retryStrategy: () => null,
	});
	// instrumentRedis must run first so its defineCommand patch
	// is in place when configureRedisInstance registers Lua commands.
	instrumentRedis({ redis: instance, region });
	configureRedisInstance(instance);
	return instance;
};

const createDisabledRedis = (): Redis =>
	new Proxy(
		{},
		{
			get(_target, prop) {
				if (prop === "status") return "end";
				if (prop === "defineCommand") return () => undefined;
				if (prop === "on" || prop === "once") return () => undefined;
				if (prop === "connect" || prop === "quit") {
					return async () => undefined;
				}
				if (prop === "disconnect") {
					return () => undefined;
				}
				return async () => {
					throw new Error("Redis is not configured");
				};
			},
		},
	) as Redis;

// Primary Redis instance (current region or default)
const primaryCacheUrl =
	regionToCacheUrl[currentRegion] || process.env.CACHE_URL || cacheBackupUrl;
if (cacheBackupUrl) {
	console.log(
		`[Redis] Using CACHE_BACKUP_URL for all regions (primary region: ${currentRegion})`,
	);
} else if (!hasRedisConfig) {
	console.warn(
		"[Redis] No Redis URL configured. Running in Postgres-only mode.",
	);
} else if (primaryCacheUrl && regionToCacheUrl[currentRegion]) {
	console.log(`Using regional cache: ${currentRegion}`);
}

const primaryRedis =
	hasRedisConfig && primaryCacheUrl
		? createRedisConnection({
				cacheUrl: primaryCacheUrl,
				region: currentRegion,
			})
		: createDisabledRedis();

/**
 * The active Redis instance. All consumer code imports this.
 * Normally points to the primary (current region).
 *
 * This is a `let` so it's a live ES module binding — reassignments here
 * are visible to all importers on their next access.
 */
export const redis: Redis = primaryRedis;

const setRedisAvailabilityState = (state: RedisAvailabilityState) => {
	if (redisAvailabilityState === state) return;

	redisAvailabilityState = state;
	console[state === "healthy" ? "info" : "warn"](
		state === "healthy"
			? "[Redis] Recovered"
			: "[Redis] Unavailable, skipping Redis-backed features",
	);
};

const pingRedisClient = async () => {
	if (redis.status !== "ready") {
		return false;
	}

	const pong = await withTimeout({
		timeoutMs: REDIS_PROBE_TIMEOUT_MS,
		fn: () => redis.ping(),
	});

	return redis.status === "ready" && pong === "PONG";
};

const tryReconnectRedis = async () => {
	if (redis.status === "ready" || redis.status === "connecting") return;

	try {
		redis.disconnect(false);
		await redis.connect();
	} catch {
		// Let the next probe decide whether we recovered.
	}
};

const tickRedisAvailability = async () => {
	if (!hasRedisConfig) return;

	try {
		if (await pingRedisClient()) {
			setRedisAvailabilityState("healthy");
			return;
		}
	} catch {}

	await tryReconnectRedis();
	setRedisAvailabilityState(
		(await pingRedisClient().catch(() => false)) ? "healthy" : "degraded",
	);
};

export const startRedisMonitor = () => {
	if (redisMonitorInterval) return;

	void tickRedisAvailability();

	redisMonitorInterval = setInterval(async () => {
		if (redisTickInFlight) return;
		redisTickInFlight = true;
		try {
			await tickRedisAvailability();
		} finally {
			redisTickInFlight = false;
		}
	}, REDIS_PROBE_INTERVAL_MS);
};

export const stopRedisMonitor = () => {
	if (redisMonitorInterval) {
		clearInterval(redisMonitorInterval);
		redisMonitorInterval = null;
	}
};

export const shouldUseRedis = () =>
	hasRedisConfig && redisAvailabilityState === "healthy";

export const getRedisAvailability = (): RedisAvailabilitySnapshot => {
	return {
		configured: hasRedisConfig,
		state: redisAvailabilityState,
		status: redis.status,
	};
};

// Lazy-loaded regional Redis instances for cross-region sync
const regionalRedisInstances: Map<string, Redis> = new Map();

/** Get Redis instance for a specific region (lazy-loaded) */
export const getRegionalRedis = (region: string): Redis => {
	if (!hasRedisConfig) {
		return primaryRedis;
	}

	// If requesting current region, return primary instance
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
			cacheKey: string,
			orgId: string,
			env: string,
			customerId: string,
			guardTimestamp: string,
			guardTtl: string,
			skipGuard: string,
		): Promise<"SKIPPED" | "DELETED" | "NOT_FOUND">;
		setFullCustomerCache(
			cacheKey: string,
			orgId: string,
			env: string,
			customerId: string,
			fetchTimeMs: string,
			cacheTtl: string,
			serializedData: string,
			overwrite: string,
			pathIndexJson: string,
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
