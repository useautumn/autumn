import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { RedisV2InstanceName } from "@/internal/misc/redisV2Cache/redisV2CacheSchemas.js";
import {
	createRedisConnection,
	currentRegion,
	redis,
	waitForRedisReady,
} from "./initRedis.js";
import {
	getAlternateRedisV2ConnectionConfig,
	getRedisV2ConnectionConfig,
} from "./initUtils/redisV2Config.js";

const redisV2Config = getRedisV2ConnectionConfig({
	cacheV2Url: process.env.CACHE_V2_URL,
	primaryCacheUrl: process.env.CACHE_URL,
	currentRegion,
});

export const redisV2: Redis = redisV2Config
	? createRedisConnection(redisV2Config)
	: redis;

const alternateInstanceUrls: Partial<Record<RedisV2InstanceName, string>> = {
	canary: process.env.CACHE_V2_CANARY_URL?.trim() || undefined,
	dragonfly: process.env.CACHE_V2_DRAGONFLY_URL?.trim() || undefined,
};

const instancePool = new Map<RedisV2InstanceName, Redis>();
const missingUrlWarned = new Set<RedisV2InstanceName>();

export const getAlternateRedisV2Instance = (
	name: RedisV2InstanceName,
): Redis | null => {
	const cacheUrl = alternateInstanceUrls[name];
	if (!cacheUrl) {
		if (!missingUrlWarned.has(name)) {
			missingUrlWarned.add(name);
			logger.warn(
				`[resolveRedisV2] activeInstance=${name} but URL is not set; falling back to primary`,
			);
		}
		return null;
	}

	const existing = instancePool.get(name);
	if (existing) return existing;

	const instance = createRedisConnection(
		getAlternateRedisV2ConnectionConfig({ name, cacheUrl, currentRegion })!,
	);
	instancePool.set(name, instance);
	return instance;
};

export const warmupRedisV2 = async (): Promise<void> => {
	if (redisV2 === redis) return;

	await waitForRedisReady(redisV2, "v2");
};
