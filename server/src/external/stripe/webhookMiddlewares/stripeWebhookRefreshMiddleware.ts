import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import type { StripeWebhookContext } from "./stripeWebhookContext.js";

// sub.created included: auto-sync can insert customer products on first delivery.
const updateProductEvents = [
	"customer.subscription.created",
	"customer.subscription.updated",
];

const coreEvents = [
	"customer.subscription.deleted",
	"subscription_schedule.canceled",
	"subscription_schedule.updated",
	"checkout.session.completed",
];

const updateInvoiceEvents = [
	"invoice.paid",
	"invoice.updated",
	"invoice.created",
	"invoice.finalized",
];

export const shouldSkipWebhookRefresh = ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}): boolean => {
	const { stripeEvent } = ctx;
	if (!stripeEvent) return false;

	// Skip cache refresh for manual invoices — these are always Autumn-initiated
	// (e.g. auto top-up, allocated invoices). The originating code path manages
	// the cache directly, so a webhook-driven nuke would discard fresh data.
	switch (stripeEvent.type) {
		case "invoice.created":
		case "invoice.finalized":
		case "invoice.updated":
		case "invoice.paid": {
			const eventData = stripeEvent.data.object;
			if (eventData?.billing_reason === "manual") return true;
			return false;
		}
		default:
			return false;
	}
};

export const refreshStripeWebhookCustomerCache = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { logger, stripeEvent } = ctx;
	const eventType = stripeEvent.type;
	const data = stripeEvent.data;

	try {
		if (shouldSkipWebhookRefresh({ ctx })) return;

		if (
			coreEvents.includes(eventType) ||
			updateProductEvents.includes(eventType) ||
			updateInvoiceEvents.includes(eventType)
		) {
			const stripeCusId = (data.object as { customer?: string }).customer;
			if (!stripeCusId) {
				logger.warn(
					`stripe webhook cache refresh, object doesn't contain customer id`,
					{ data: { eventType, object: data.object } },
				);
				return;
			}

			const customer = ctx.fullCustomer;
			if (!customer) {
				logger.warn(`Customer not found in context, skipping cache refresh`);
				return;
			}

			await deleteCachedFullCustomer({
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
