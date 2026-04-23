import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getActiveRedisV2Instance,
	getRedisV2CacheStatus,
} from "@/internal/misc/redisV2Cache/redisV2CacheStore.js";

export const handleGetAdminRedisV2CacheConfig = createRoute({
	handler: async (c) => {
		const status = getRedisV2CacheStatus();
		return c.json({
			activeInstance: getActiveRedisV2Instance(),
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
