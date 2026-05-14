import type { RedisV2InstanceName } from "@/internal/misc/redisV2Cache/redisV2CacheSchemas.js";

export const REDIS_V2_COMMAND_TIMEOUT_MS = 1_000;

export const getRedisV2ConnectionConfig = ({
	cacheV2Url,
	primaryCacheUrl,
	currentRegion,
	instanceName,
}: {
	cacheV2Url?: string;
	primaryCacheUrl?: string;
	currentRegion: string;
	instanceName: RedisV2InstanceName;
}) =>
	cacheV2Url?.trim() && cacheV2Url.trim() !== primaryCacheUrl?.trim()
		? {
				cacheUrl: cacheV2Url.trim(),
				region: `${currentRegion}:v2`,
				supportsUpstashShebang: supportsUpstashShebangForRedisV2(instanceName),
				commandTimeout: REDIS_V2_COMMAND_TIMEOUT_MS,
			}
		: null;

export const supportsUpstashShebangForRedisV2 = (name: RedisV2InstanceName) =>
	name === "upstash";
