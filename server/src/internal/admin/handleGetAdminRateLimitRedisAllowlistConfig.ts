import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getRateLimitRedisAllowlistFromSource,
	getRuntimeRateLimitRedisAllowlistStatus,
} from "@/internal/misc/rateLimiter/rateLimitRedisAllowlistStore.js";

export const handleGetAdminRateLimitRedisAllowlistConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeRateLimitRedisAllowlistStatus();
		const config = await getRateLimitRedisAllowlistFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
