export const REDIS_V2_INSTANCE_OPTIONS = [
	{
		value: "upstash",
		label: "Upstash",
		description: "CACHE_V2_UPSTASH_URL",
	},
	{
		value: "redis",
		label: "Redis",
		description: "CACHE_V2_REDIS_URL",
	},
	{
		value: "dragonfly",
		label: "Dragonfly",
		description: "CACHE_V2_DRAGONFLY_URL",
	},
] as const;

export type RedisV2InstanceName =
	(typeof REDIS_V2_INSTANCE_OPTIONS)[number]["value"];

export type RedisV2CacheConfig = {
	activeInstance: RedisV2InstanceName;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const REDIS_V2_CACHE_DEFAULTS: RedisV2CacheConfig = {
	activeInstance: "upstash",
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

export const REDIS_V2_CACHE_QUERY_KEY = [
	"admin-edge-config",
	"redis-v2-cache",
] as const;
