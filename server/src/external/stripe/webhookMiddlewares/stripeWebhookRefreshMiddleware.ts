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
	const { db, logger, org, env, stripeEvent } = ctx;

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

			await deleteCachedApiCustomer({
				customerId: customer.id!,
				orgId: org.id,
				env,
				source: `stripeWebhookRefreshMiddleware: ${eventType}`,
			});

			// let fullCus: FullCustomer | undefined;
			// if (
			// 	updateProductEvents.includes(eventType) ||
			// 	updateInvoiceEvents.includes(eventType)
			// ) {
			// 	fullCus = await CusService.getFull({
			// 		db,
			// 		idOrInternalId: customer.id!,
			// 		orgId: org.id,
			// 		env,
			// 		withEntities: true,
			// 		withSubs: true,
			// 		expand: [CusExpand.Invoices],
			// 	});

			// 	if (updateProductEvents.includes(eventType)) {
			// 		await setCachedApiSubs({
			// 			ctx,
			// 			fullCus,
			// 			customerId: customer.id!,
			// 		});
			// 	}

			// 	if (updateInvoiceEvents.includes(eventType)) {
			// 		await setCachedApiInvoices({
			// 			ctx,
			// 			fullCus,
			// 			customerId: customer.id!,
			// 		});
			// 	}
			// } else {
			// 	logger.info(`Attempting delete cached api customer! ${eventType}`);
			// 	await deleteCachedApiCustomer({
			// 		customerId: customer.id!,
			// 		orgId: org.id,
			// 		env,
			// 		source: `stripeWebhookRefreshMiddleware: ${eventType}`,
			// 	});
			// }
		}
	} catch (error) {
		logger.error(`Stripe webhook, error refreshing cache: ${error}`, {
			error: {
				message: error instanceof Error ? error.message : String(error),
			},
		});
	}
};
