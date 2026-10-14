import type { Context, Next } from "hono";
import { shouldPreserveInvoiceCreatedCache } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/shouldPreserveInvoiceCreatedCache";
import { shouldPreserveInvoicePaidCache } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/shouldPreserveInvoicePaidCache";
import { shouldPreserveScheduleReleasedCache } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionScheduleReleased/shouldPreserveScheduleReleasedCache";
import { shouldPreserveScheduleUpdatedCache } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionScheduleUpdated/shouldPreserveScheduleUpdatedCache";
import { shouldPreserveSubscriptionUpdateCache } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/shouldPreserveSubscriptionUpdateCache";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "./stripeWebhookContext.js";

const updateProductEvents = [
	"customer.subscription.created",
	"customer.subscription.updated",
];

const coreEvents = [
	"customer.subscription.deleted",
	"subscription_schedule.canceled",
	"subscription_schedule.released",
	"subscription_schedule.updated",
	"checkout.session.completed",
	"checkout.session.expired",
];

const updateInvoiceEvents = [
	"invoice.paid",
	"invoice.updated",
	"invoice.created",
	"invoice.finalized",
];

export const shouldRefreshAfterWebhookHandler = ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}): boolean => {
	if (ctx.skipSubjectCacheDeletion) return false;

	const { stripeEvent, handlerResult } = ctx;
	switch (stripeEvent?.type) {
		case "invoice.created":
			if (handlerResult?.type !== stripeEvent.type) return true;
			return !shouldPreserveInvoiceCreatedCache({
				eventContext: handlerResult.context,
			});
		case "invoice.paid":
			if (handlerResult?.type !== stripeEvent.type) return true;
			return !shouldPreserveInvoicePaidCache({
				eventContext: handlerResult.context,
			});
		case "customer.subscription.updated":
			if (handlerResult?.type !== stripeEvent.type) return true;
			return !shouldPreserveSubscriptionUpdateCache({
				event: stripeEvent,
				eventContext: handlerResult.context,
			});
		case "subscription_schedule.updated":
			if (handlerResult?.type !== stripeEvent.type) return true;
			return !shouldPreserveScheduleUpdatedCache({
				event: stripeEvent,
				eventContext: handlerResult.context,
			});
		case "subscription_schedule.released":
			if (handlerResult?.type !== stripeEvent.type) return true;
			return !shouldPreserveScheduleReleasedCache({
				event: stripeEvent,
				eventContext: handlerResult.context,
			});
		default:
			return true;
	}
};

export const shouldSkipWebhookRefresh = ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}): boolean => {
	const { stripeEvent } = ctx;
	if (!stripeEvent) return false;

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

export const stripeWebhookRefreshMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	await next();

	const ctx = c.get("ctx");
	const { logger, stripeEvent } = ctx;

	if (!stripeEvent) return;
	if (!shouldRefreshAfterWebhookHandler({ ctx })) return;

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
					{
						data: {
							eventType,
							object: data.object,
						},
					},
				);
				return;
			}

			const customer = ctx.fullCustomer;

			if (!customer) {
				logger.warn(`Customer not found in context, skipping cache refresh`);
				return;
			}

			await deleteCachedFullCustomer({
				customerId: customer.id ?? customer.internal_id,
				ctx,
				source: `stripeWebhookRefreshMiddleware: ${eventType}`,
				flushBalances: true,
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
