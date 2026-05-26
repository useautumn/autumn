import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { RedisV2InstanceName } from "@/internal/misc/redisV2Cache/redisV2CacheSchemas.js";
import { getReachableDragonflyUrl } from "./getReachableDragonflyUrl.js";
import {
	createRedisConnection,
	currentRegion,
	redis,
	waitForRedisReady,
} from "./initRedis.js";
import {
	REDIS_V2_COMMAND_TIMEOUT_MS,
	supportsUpstashShebangForRedisV2,
} from "./initUtils/redisV2Config.js";

const rawDragonflyUrl = process.env.CACHE_V2_DRAGONFLY_URL?.trim();
const dragonflyUrl = rawDragonflyUrl
	? getReachableDragonflyUrl(rawDragonflyUrl)
	: undefined;

export const hasRedisV2Config = Boolean(dragonflyUrl);

export const redisV2: Redis = createRedisConnection({
	cacheUrl: dragonflyUrl || "",
	region: `${currentRegion}:v2`,
	supportsUpstashShebang: false,
	commandTimeout: REDIS_V2_COMMAND_TIMEOUT_MS,
});

const alternateInstanceUrls: Partial<Record<RedisV2InstanceName, string>> = {
	upstash: process.env.CACHE_V2_UPSTASH_URL?.trim() || undefined,
	redis: process.env.CACHE_V2_REDIS_URL?.trim() || undefined,
	dragonfly: dragonflyUrl,
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

	const instance = createRedisConnection({
		cacheUrl,
		region: `${currentRegion}:v2:${name}`,
		supportsUpstashShebang: supportsUpstashShebangForRedisV2(name),
		commandTimeout: REDIS_V2_COMMAND_TIMEOUT_MS,
	});
	instancePool.set(name, instance);
	return instance;
};

export const warmupRedisV2 = async (): Promise<void> => {
	if (redisV2 === redis) return;

	await waitForRedisReady(redisV2, "v2");
};
