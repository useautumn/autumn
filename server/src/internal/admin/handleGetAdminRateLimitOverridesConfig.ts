import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	AUTO_TOPUP_ATTEMPTS_RATE_LIMIT,
	DEFAULT_AUTO_TOPUP_ATTEMPT_LIMIT,
} from "@/internal/balances/autoTopUp/helpers/limits/autoTopupRateLimitConfigs.js";
import { listRateLimitPolicies } from "@/internal/misc/rateLimiter/policySummaries/listRateLimitPolicies.js";
import {
	RATE_LIMIT_CONFIGS,
	RateLimitScope,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import {
	getRateLimitOverridesFromSource,
	getRuntimeRateLimitOverridesStatus,
} from "@/internal/misc/rateLimiter/rateLimitOverridesStore.js";
import { findRateLimitOverrideOrgs } from "./rateLimitOverrides/findRateLimitOverrideOrgs.js";

export const handleGetAdminRateLimitOverridesConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
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
			policies: listRateLimitPolicies({ overrides: config }),
			orgsByKey: await findRateLimitOverrideOrgs({
				ctx,
				orgKeys: Object.keys(config.orgs),
			}),
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
