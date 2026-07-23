import type { Redis } from "ioredis";
import { getActiveMainRedisInstance } from "@/internal/misc/mainRedisCache/mainRedisCacheStore.js";
import {
	createMainRedisRouter,
	selectMainRedisClient,
} from "../mainRedisRouting.js";
import { createDisabledRedis, createRedisClient } from "./createRedisClient.js";
import {
	cacheBackupUrl,
	currentRegion,
	getCacheUrlForRegion,
	hasRedisConfig,
	PRIMARY_REGION,
	primaryCacheUrl,
} from "./redisConfig.js";

if (cacheBackupUrl) {
	console.log(
		`[Redis] CACHE_BACKUP_URL configured as fallback (primary region: ${currentRegion})`,
	);
} else if (!hasRedisConfig) {
	console.warn(
		"[Redis] No Redis URL configured. Running in Postgres-only mode.",
	);
} else if (primaryCacheUrl && getCacheUrlForRegion({ region: currentRegion })) {
	console.log(`Using regional cache: ${currentRegion}`);
}

const localPrimaryRedis =
	hasRedisConfig && primaryCacheUrl
		? createRedisClient({
				cacheUrl: primaryCacheUrl,
				region: currentRegion,
			})
		: createDisabledRedis();

const fallbackRedis = !cacheBackupUrl
	? null
	: cacheBackupUrl === primaryCacheUrl
		? localPrimaryRedis
		: createRedisClient({
				cacheUrl: cacheBackupUrl,
				region: `${currentRegion}:fallback`,
			});

export const getFallbackRedis = (): Redis | null => fallbackRedis;

// Lazy-loaded regional Redis instances for cross-region sync
const regionalRedisInstances: Map<string, Redis> = new Map();
let lastLoggedInstance: string | null = null;
let missingFallbackWarned = false;

export const getRegionalRedisForInstance = ({
	region,
	instance,
}: {
	region: string;
	instance: "primary" | "fallback";
}): Redis => {
	if (instance === "fallback" && fallbackRedis) return fallbackRedis;

	if (!hasRedisConfig) {
		return localPrimaryRedis;
	}
	if (region === currentRegion) {
		return localPrimaryRedis;
	}

	const cacheUrl = getCacheUrlForRegion({ region });

	if (!cacheUrl) {
		console.warn(
			`No cache URL configured for region ${region}, falling back to primary`,
		);
		return localPrimaryRedis;
	}

	if (cacheUrl === primaryCacheUrl) {
		return localPrimaryRedis;
	}

	let regionalInstance = regionalRedisInstances.get(region);
	if (regionalInstance) {
		return regionalInstance;
	}

	console.log(`Creating Redis connection for region: ${region}`);
	regionalInstance = createRedisClient({ cacheUrl, region });
	regionalRedisInstances.set(region, regionalInstance);

	return regionalInstance;
};

/** Get the active Redis instance for a region. */
export const getRegionalRedis = (region: string): Redis => {
	const activeInstance = getActiveMainRedisInstance();
	if (activeInstance !== lastLoggedInstance) {
		console.log(`[Redis] Active main instance: ${activeInstance}`);
		lastLoggedInstance = activeInstance;
	}
	if (
		activeInstance === "fallback" &&
		!fallbackRedis &&
		!missingFallbackWarned
	) {
		console.warn(
			"[Redis] Fallback selected without CACHE_BACKUP_URL; using primary",
		);
		missingFallbackWarned = true;
	}

	return selectMainRedisClient({
		activeInstance,
		primary: () => getRegionalRedisForInstance({ region, instance: "primary" }),
		fallback: fallbackRedis,
	});
};

export const redis: Redis = createMainRedisRouter({
	resolve: () => getRegionalRedis(currentRegion),
});

/** Get the primary Redis instance (us-west-2) to avoid replication lag issues */
export const getPrimaryRedis = () => getRegionalRedis(PRIMARY_REGION);
