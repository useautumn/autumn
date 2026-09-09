import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	AUTO_TOPUP_ATTEMPTS_RATE_LIMIT,
	DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT,
} from "@/internal/balances/autoTopUp/helpers/limits/autoTopupRateLimitConfigs.js";
import {
	RATE_LIMIT_CONFIGS,
	RateLimitScope,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import {
	getRateLimitOverridesFromSource,
	getRuntimeRateLimitOverridesStatus,
} from "@/internal/misc/rateLimiter/rateLimitOverridesStore.js";

export const handleGetAdminRateLimitOverridesConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeRateLimitOverridesStatus();
		const config = await getRateLimitOverridesFromSource();

		const defaults: Record<
			string,
			{ limit: number; windowMs: number; scope: RateLimitScope }
		> = Object.fromEntries(
			Object.entries(RATE_LIMIT_CONFIGS).map(([type, cfg]) => [
				type,
				{
					limit: cfg.limit,
					windowMs: cfg.windowMs,
					scope: cfg.scope,
				},
			]),
		);
		defaults[AUTO_TOPUP_ATTEMPTS_RATE_LIMIT] = {
			limit: DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT.limit,
			windowMs: 10 * 60 * 1000,
			scope: RateLimitScope.Customer,
		};

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
