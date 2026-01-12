import type { Context, Next } from "hono";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import type { StripeWebhookHonoEnv } from "./stripeWebhookContext.js";

const updateProductEvents = ["customer.subscription.updated"];

const coreEvents = [
	"customer.subscription.deleted",
	"subscription_schedule.canceled",
	"checkout.session.completed",
];

const updateInvoiceEvents = [
	"invoice.paid",
	"invoice.updated",
	"invoice.created",
	"invoice.finalized",
];

/**
 * Middleware that refreshes customer cache after webhook handlers complete
 * Runs after the main handler (post-processing)
 */
export const stripeWebhookRefreshMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	// Run the main handler first
	await next();

	// Post-processing: refresh cache
	const ctx = c.get("ctx");
	const { logger, org, env, stripeEvent } = ctx;

	if (!stripeEvent) return;

	const eventType = stripeEvent.type;
	const data = stripeEvent.data;

	try {
		if (
			coreEvents.includes(eventType) ||
			updateProductEvents.includes(eventType) ||
			updateInvoiceEvents.includes(eventType)
		) {
			const stripeCusId = (data.object as { customer?: string }).customer;
			if (!stripeCusId) {
				logger.warn(
					`stripe webhook cache refresh, object doesn't contain customer id`,
					{
						data: {
							eventType,
							object: data.object,
						},
					},
				);
				return;
			}

			const customer = ctx.customer;

			if (!customer) {
				logger.warn(`Customer not found in context, skipping cache refresh`);
				return;
			}

			logger.info(`Attempting delete cached api customer! ${eventType}`);
			await deleteCachedApiCustomer({
				customerId: customer.id!,
				ctx,
				source: `stripeWebhookRefreshMiddleware: ${eventType}`,
			});
		}
	} catch (error) {
		logger.error(`Stripe webhook, error refreshing cache: ${error}`, {
			error: {
				message: error instanceof Error ? error.message : String(error),
			},
		});
	}
};
