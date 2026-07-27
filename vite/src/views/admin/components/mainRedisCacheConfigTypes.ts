export const MAIN_REDIS_INSTANCE_OPTIONS = [
	{
		value: "primary",
		label: "Primary",
		description: "Regional CACHE_URL endpoints",
	},
	{
		value: "fallback",
		label: "Fallback",
		description: "Global CACHE_BACKUP_URL endpoint",
	},
] as const;

export type MainRedisInstanceName =
	(typeof MAIN_REDIS_INSTANCE_OPTIONS)[number]["value"];

export type MainRedisCacheConfig = {
	activeInstance: MainRedisInstanceName;
	fallbackConfigured: boolean;
	fallbackStatus: string;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const MAIN_REDIS_CACHE_QUERY_KEY = [
	"admin-edge-config",
	"main-redis-cache",
] as const;
