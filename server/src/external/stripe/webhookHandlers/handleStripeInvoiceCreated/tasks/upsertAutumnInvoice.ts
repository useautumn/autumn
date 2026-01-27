import { cp, stripeToAtmnAmount } from "@autumn/shared";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import type { InvoiceCreatedContext } from "../setupInvoiceCreatedContext";

/**
 * Upserts an Autumn invoice record from the Stripe invoice.created webhook.
 *
 * Behavior:
 * - Skips first invoice (billing_reason: subscription_create) - handled elsewhere
 * - Tries to update existing invoice by Stripe ID first
 * - If not found, creates a new invoice record
 */
export const upsertAutumnInvoice = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
}): Promise<void> => {
	const { stripeInvoice, customerProducts, fullCustomer, stripeSubscription } =
		eventContext;

	// Skip first invoice (subscription_create)
	if (stripeInvoice.billing_reason !== "subscription_cycle") {
		ctx.logger.info(
			"[invoice.created] Skipping invoice upsert for non periodic invoice",
		);
		return;
	}

	const updatedStripeInvoice = await getStripeInvoice({
		stripeClient: ctx.stripeCli,
		invoiceId: stripeInvoice.id,
		expand: ["discounts.source.coupon", "total_discount_amounts"],
	});

	// Add scheduled customer products that have started
	const startedScheduledCustomerProducts =
		fullCustomer.customer_products.filter((customerProduct) => {
			const scheduleId = stripeSubscriptionToScheduleId({ stripeSubscription });

			const { valid: hasStarted } = cp(customerProduct)
				.onStripeSubscription({
					stripeSubscriptionId: stripeSubscription.id,
				})
				.or.onStripeSchedule({
					stripeSubscriptionScheduleId: scheduleId,
				})
				.scheduled()
				.hasStarted({ nowMs: eventContext.nowMs });

			return hasStarted;
		});

	const allCustomerProducts = [
		...customerProducts,
		...startedScheduledCustomerProducts,
	];

	const productIds = [
		...new Set(allCustomerProducts.map((cp) => cp.product.id)),
	];
	const internalProductIds = [
		...new Set(allCustomerProducts.map((cp) => cp.internal_product_id)),
	];
	const internalCustomerId = fullCustomer.internal_id;

	// Entity ID - if all customer products have same entity, use it
	const internalEntityId =
		customerProducts.length > 0 &&
		customerProducts.every(
			(cp) => cp.internal_entity_id === customerProducts[0].internal_entity_id,
		)
			? customerProducts[0].internal_entity_id
			: null;

	// Try update first
	const updated = await InvoiceService.updateByStripeId({
		db: ctx.db,
		stripeId: stripeInvoice.id,
		updates: {
			product_ids: productIds,
			internal_product_ids: internalProductIds,
			total: stripeToAtmnAmount({
				amount: updatedStripeInvoice.total,
				currency: updatedStripeInvoice.currency,
			}),
		},
	});

	if (updated) {
		ctx.logger.info(
			`[invoice.created] Updated existing invoice ${stripeInvoice.id}`,
		);
		return;
	}

	// Create new
	await InvoiceService.createInvoiceFromStripe({
		db: ctx.db,
		stripeInvoice: updatedStripeInvoice,
		internalCustomerId,
		internalEntityId,
		org: ctx.org,
		productIds,
		internalProductIds,
		items: [],
	});

	ctx.logger.info(`[invoice.created] Created new invoice ${stripeInvoice.id}`);
};
