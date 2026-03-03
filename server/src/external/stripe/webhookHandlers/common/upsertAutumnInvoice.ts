import {
	cp,
	deduplicateArray,
	type FullCusProduct,
	type FullCustomerPrice,
	type Invoice,
} from "@autumn/shared";
import type Stripe from "stripe";
import {
	stripeSubscriptionToNowMs,
	stripeSubscriptionToScheduleId,
} from "@/external/stripe/subscriptions";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils";

/**
 * Upserts an Autumn invoice record from a Stripe invoice webhook.
 * Used by invoice.created, invoice.finalized, and invoice.paid handlers.
 *
 * Handles:
 * - Merging scheduled-but-started customer products into product IDs
 * - Try update existing invoice first, then create if not found
 * - Computing invoice items from prices
 *
 * For non-subscription invoices (e.g., one-off checkout), pass undefined for
 * stripeSubscription and customerProducts. The function will try to update
 * an existing invoice but skip creation.
 *
 * @returns The invoice record (existing or new), or null if skipped
 */
export const upsertAutumnInvoice = async ({
	ctx,
	stripeInvoice,
	stripeSubscription,
	customerProducts,
	options,
}: {
	ctx: StripeWebhookContext;
	stripeInvoice: Stripe.Invoice;
	stripeSubscription?: Stripe.Subscription;
	customerProducts?: FullCusProduct[];
	options?: { skipNonCycleInvoices?: boolean };
}): Promise<Invoice | null> => {
	const { db, org, logger, stripeCli, fullCustomer } = ctx;

	// 1. Skip non-cycle invoices if requested (invoice.created uses this)
	if (
		options?.skipNonCycleInvoices &&
		stripeInvoice.billing_reason !== "subscription_cycle"
	) {
		logger.info(
			`[upsertAutumnInvoice] Skipping non-cycle invoice (billing_reason: ${stripeInvoice.billing_reason})`,
		);
		return null;
	}

	// 2. Try to update existing invoice first (works even without subscription)
	const updated = await InvoiceService.updateFromStripeInvoice({
		db,
		stripeInvoice,
	});

	if (updated) {
		logger.info(`[upsertAutumnInvoice] Updated invoice ${stripeInvoice.id}`);
		return updated;
	}

	// 3. For creation, we need subscription context and customer products
	if (
		!stripeSubscription ||
		!customerProducts ||
		customerProducts.length === 0
	) {
		logger.debug(
			`[upsertAutumnInvoice] No subscription/customerProducts, skipping creation for ${stripeInvoice.id}`,
		);
		return null;
	}

	if (!fullCustomer) {
		logger.warn(
			`[upsertAutumnInvoice] No fullCustomer, cannot create invoice ${stripeInvoice.id}`,
		);
		return null;
	}

	// 4. Get nowMs (test-clock aware)
	const nowMs = await stripeSubscriptionToNowMs({
		stripeSubscription,
		stripeCli,
	});

	// 5. Merge scheduled-but-started customer products
	const scheduleId = stripeSubscriptionToScheduleId({ stripeSubscription });

	const startedScheduledCustomerProducts = (
		fullCustomer.customer_products ?? []
	).filter((customerProduct) => {
		const { valid: hasStarted } = cp(customerProduct)
			.onStripeSubscription({
				stripeSubscriptionId: stripeSubscription.id,
			})
			.or.onStripeSchedule({
				stripeSubscriptionScheduleId: scheduleId ?? undefined,
			})
			.scheduled()
			.hasStarted({ nowMs });

		return hasStarted;
	});

	const allCustomerProducts = [
		...customerProducts,
		...startedScheduledCustomerProducts,
	];

	// 6. Compute product IDs and entity ID
	const productIds = deduplicateArray(
		allCustomerProducts.map((cp) => cp.product.id),
	);
	const internalProductIds = deduplicateArray(
		allCustomerProducts.map((cp) => cp.internal_product_id),
	);

	const internalEntityIds = deduplicateArray(
		allCustomerProducts.map((cp) => cp.internal_entity_id),
	);
	const internalEntityId =
		internalEntityIds.length === 1 ? internalEntityIds[0] : null;

	// 7. Compute invoice items from prices
	const prices = allCustomerProducts.flatMap((cp) =>
		cp.customer_prices.map((cpr: FullCustomerPrice) => cpr.price),
	);

	const invoiceItems = await getInvoiceItems({
		stripeInvoice,
		prices,
		logger,
	});

	// 8. Create new invoice
	const newInvoice = await InvoiceService.createInvoiceFromStripe({
		db,
		stripeInvoice,
		internalCustomerId: fullCustomer.internal_id,
		internalEntityId,
		org,
		productIds,
		internalProductIds,
		items: invoiceItems,
	});

	if (newInvoice) {
		logger.info(`[upsertAutumnInvoice] Created invoice ${stripeInvoice.id}`);
	}

	return newInvoice ?? null;
};
