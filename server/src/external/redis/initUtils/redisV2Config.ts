import type { RedisV2InstanceName } from "@/internal/misc/redisV2Cache/redisV2CacheSchemas.js";

export const getRedisV2ConnectionConfig = ({
	cacheV2Url,
	primaryCacheUrl,
	currentRegion,
}: {
	cacheV2Url?: string;
	primaryCacheUrl?: string;
	currentRegion: string;
}) =>
	cacheV2Url?.trim() && cacheV2Url.trim() !== primaryCacheUrl?.trim()
		? {
				cacheUrl: cacheV2Url.trim(),
				region: `${currentRegion}:v2`,
				supportsUpstashShebang: false,
			}
		: null;

export const getAlternateRedisV2ConnectionConfig = ({
	name,
	cacheUrl,
	currentRegion,
}: {
	name: RedisV2InstanceName;
	cacheUrl?: string;
	currentRegion: string;
}) =>
	cacheUrl?.trim()
		? {
				cacheUrl: cacheUrl.trim(),
				region: `${currentRegion}:v2:${name}`,
				supportsUpstashShebang: name === "canary",
			}
		: null;
