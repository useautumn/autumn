import type { Context, Next } from "hono";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import type { RevenueCatWebhookHonoEnv } from "./revenuecatWebhookContext.js";

/**
 * Middleware that refreshes customer cache after RevenueCat webhook handlers complete.
 * Handlers must set `ctx.revenuecatCustomerId` for the cache to be invalidated.
 */
export const revenuecatWebhookRefreshMiddleware = async (
	c: Context<RevenueCatWebhookHonoEnv>,
	next: Next,
) => {
	// Run the main handler first
	await next();

	// Post-processing: refresh cache
	const ctx = c.get("ctx");
	const { logger, org, env, customerId, revenuecatEventType } = ctx;

	if (!customerId) {
		logger.warn(
			"RevenueCat webhook: No customer ID set in context, skipping cache refresh",
		);
		return;
	}

	try {
		logger.info(
			`Attempting delete cached api customer! RevenueCat ${revenuecatEventType}`,
		);

		await deleteCachedApiCustomer({
			customerId,
			orgId: org.id,
			env,
			source: `revenuecatWebhookRefreshMiddleware: ${revenuecatEventType}`,
			logger,
		});
	} catch (error) {
		logger.error(`RevenueCat webhook, error refreshing cache: ${error}`, {
			error: {
				message: error instanceof Error ? error.message : String(error),
			},
		});
	}
};
