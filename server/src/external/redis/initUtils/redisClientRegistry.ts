import type { Redis } from "ioredis";
import { getActiveMainRedisInstance } from "@/internal/misc/mainRedisCache/mainRedisCacheStore.js";
import {
	createMiscRedisRouter,
	selectMiscRedisClient,
} from "../miscRedisRouting.js";
import { createDisabledRedis, createRedisClient } from "./createRedisClient.js";
import {
	currentRegion,
	hasMiscRedisConfig,
	miscRedisBackupUrl,
	miscRedisUrl,
} from "./redisConfig.js";

if (miscRedisBackupUrl) {
	console.log("[Redis] CACHE_BACKUP_URL configured as fallback");
} else if (!hasMiscRedisConfig) {
	console.warn(
		"[Redis] No Redis URL configured. Running in Postgres-only mode.",
	);
}

const miscRedisClient =
	hasMiscRedisConfig && miscRedisUrl
		? createRedisClient({
				cacheUrl: miscRedisUrl,
				region: currentRegion,
			})
		: createDisabledRedis();

const fallbackRedis = !miscRedisBackupUrl
	? null
	: miscRedisBackupUrl === miscRedisUrl
		? miscRedisClient
		: createRedisClient({
				cacheUrl: miscRedisBackupUrl,
				region: `${currentRegion}:fallback`,
				cacheCert: null,
			});

export const getFallbackRedis = (): Redis | null => fallbackRedis;

let lastLoggedInstance: string | null = null;
let missingFallbackWarned = false;

/** Active misc-cache Redis, honoring the primary/fallback edge-config switch. */
export const getMiscRedis = (): Redis => {
	const activeInstance = getActiveMainRedisInstance();
	if (activeInstance !== lastLoggedInstance) {
		console.log(`[Redis] Active misc instance: ${activeInstance}`);
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

	return selectMiscRedisClient({
		activeInstance,
		primary: () => miscRedisClient,
		fallback: fallbackRedis,
	});
};

export const miscRedis: Redis = createMiscRedisRouter({
	resolve: getMiscRedis,
});

/** @deprecated Use `miscRedis`. Kept for cloud-repo callers. */
export const redis: Redis = miscRedis;

/** @deprecated Use `getMiscRedis`. Kept for cloud-repo callers. */
export const getPrimaryRedis = getMiscRedis;

/** @deprecated Single-region now — use `getMiscRedis`. Kept for cloud-repo callers. */
export const getRegionalRedis = (_region?: string): Redis => getMiscRedis();
