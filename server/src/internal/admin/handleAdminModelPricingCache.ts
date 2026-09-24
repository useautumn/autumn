import { ErrCode, InternalError, Scopes } from "@autumn/shared";
import {
	clearModelPricingCache,
	getModelPricingCacheTtl,
	MODEL_PRICING_CACHE_KEY,
} from "@/external/redis/actions/modelPricingCache/modelPricingCache.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

/** GET /admin/model-pricing-cache */
export const handleGetAdminModelPricingCache = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ttlSeconds = await getModelPricingCacheTtl();
		return c.json({
			key: MODEL_PRICING_CACHE_KEY,
			cached: ttlSeconds !== null,
			ttlSeconds,
		});
	},
});

/** DELETE /admin/model-pricing-cache — the next token track refetches models.dev. */
export const handleClearAdminModelPricingCache = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const cleared = await clearModelPricingCache();
		if (!cleared) {
			throw new InternalError({
				message: "Failed to clear the models.dev pricing cache",
				code: ErrCode.InternalError,
			});
		}

		ctx.logger.info(
			`[modelPricingCache] ${ctx.user?.email ?? ctx.userId ?? "unknown"} cleared ${MODEL_PRICING_CACHE_KEY}`,
		);
		return c.json({ success: true });
	},
});
