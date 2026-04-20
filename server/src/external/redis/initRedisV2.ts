import type { Redis } from "ioredis";
import {
	createRedisConnection,
	currentRegion,
	redis,
	waitForRedisReady,
} from "./initRedis.js";

const cacheV2Url = process.env.CACHE_V2_URL?.trim();
const primaryCacheUrl = process.env.CACHE_URL?.trim();

export const redisV2: Redis =
	cacheV2Url && cacheV2Url !== primaryCacheUrl
		? createRedisConnection({
				cacheUrl: cacheV2Url,
				region: `${currentRegion}:v2`,
			})
		: redis;

export const warmupRedisV2 = async (): Promise<void> => {
	if (redisV2 === redis) return;

	await waitForRedisReady(redisV2, "v2");
};
