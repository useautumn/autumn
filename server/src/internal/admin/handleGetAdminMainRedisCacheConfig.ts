import { Scopes } from "@autumn/shared";
import { getFallbackRedis } from "@/external/redis/initRedis.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getActiveMainRedisInstance,
	getMainRedisCacheStatus,
} from "@/internal/misc/mainRedisCache/mainRedisCacheStore.js";

export const handleGetAdminMainRedisCacheConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getMainRedisCacheStatus();
		const fallback = getFallbackRedis();

		return c.json({
			activeInstance: getActiveMainRedisInstance(),
			fallbackConfigured: Boolean(fallback),
			fallbackStatus: fallback?.status ?? "not_configured",
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
