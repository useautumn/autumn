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
	const { stripeInvoice, customerProducts, fullCustomer } = eventContext;

	// Skip first invoice (subscription_create)
	if (stripeInvoice.billing_reason === "subscription_create") {
		ctx.logger.debug(
			"[invoice.created] Skipping invoice upsert for subscription_create",
		);
		return;
	}

	const productIds = [...new Set(customerProducts.map((cp) => cp.product.id))];
	const internalProductIds = [
		...new Set(customerProducts.map((cp) => cp.internal_product_id)),
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
		},
	});

	if (updated) {
		ctx.logger.debug(
			`[invoice.created] Updated existing invoice ${stripeInvoice.id}`,
		);
		return;
	}

	// Create new
	await InvoiceService.createInvoiceFromStripe({
		db: ctx.db,
		stripeInvoice,
		internalCustomerId,
		internalEntityId,
		org: ctx.org,
		productIds,
		internalProductIds,
		items: [],
	});

	ctx.logger.debug(`[invoice.created] Created new invoice ${stripeInvoice.id}`);
};
