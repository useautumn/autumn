import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RATE_LIMIT_CONFIGS } from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import {
	getRateLimitOverridesFromSource,
	getRuntimeRateLimitOverridesStatus,
} from "@/internal/misc/rateLimiter/rateLimitOverridesStore.js";

export const handleGetAdminRateLimitOverridesConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeRateLimitOverridesStatus();
		const config = await getRateLimitOverridesFromSource();

		const defaults = Object.fromEntries(
			Object.entries(RATE_LIMIT_CONFIGS).map(([type, cfg]) => [
				type,
				{
					limit: cfg.limit,
					windowMs: cfg.windowMs,
					scope: cfg.scope,
				},
			]),
		);

		return c.json({
			...config,
			defaults,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
