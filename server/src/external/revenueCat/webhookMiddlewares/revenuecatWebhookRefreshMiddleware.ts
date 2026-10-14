import type { Context, Next } from "hono";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import type { RevenueCatWebhookHonoEnv } from "./revenuecatWebhookContext.js";

export const revenuecatWebhookRefreshMiddleware = async (
	c: Context<RevenueCatWebhookHonoEnv>,
	next: Next,
) => {
	await next();

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

		await deleteCachedFullCustomer({
			customerId,
			ctx,
			source: `revenuecatWebhookRefreshMiddleware: ${revenuecatEventType}`,
		});
	} catch (error) {
		logger.error(`RevenueCat webhook, error refreshing cache: ${error}`, {
			error: {
				message: error instanceof Error ? error.message : String(error),
			},
		});
	}
};
