import {
	deduplicateArray,
	type FullCustomerPrice,
	type InvoiceStatus,
} from "@autumn/shared";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils";
import type { InvoiceFinalizedContext } from "../setupInvoiceFinalizedContext";

/**
 * Upserts an Autumn invoice record from the Stripe invoice.finalized webhook.
 * Either updates an existing invoice or creates a new one.
 */
export const upsertAutumnInvoice = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceFinalizedContext;
}): Promise<void> => {
	const { db, org, logger, stripeCli } = ctx;
	const { stripeInvoice, customerProducts } = eventContext;

	// Get expanded invoice with total_discount_amounts
	const expandedInvoice = await getStripeInvoice({
		stripeClient: stripeCli,
		invoiceId: stripeInvoice.id,
		expand: ["discounts.source.coupon", "total_discount_amounts"],
	});

	// Try to update existing invoice first
	const updated = await InvoiceService.updateFromStripeInvoice({
		db,
		stripeInvoice: expandedInvoice,
	});

	if (updated) {
		logger.info(
			`[invoice.finalized] Updated existing invoice ${stripeInvoice.id}`,
		);
		return;
	}

	// Create new invoice
	const prices = customerProducts.flatMap((cp) =>
		cp.customer_prices.map((cpr: FullCustomerPrice) => cpr.price),
	);

	const invoiceItems = await getInvoiceItems({
		stripeInvoice: expandedInvoice,
		prices,
		logger,
	});

	const internalEntityIds = deduplicateArray(
		customerProducts.map((cp) => cp.internal_entity_id),
	);

	const productIds = deduplicateArray(
		customerProducts.map((p) => p.product.id),
	);

	const internalProductIds = deduplicateArray(
		customerProducts.map((p) => p.internal_product_id),
	);

	await InvoiceService.createInvoiceFromStripe({
		db,
		stripeInvoice: expandedInvoice,
		internalCustomerId: customerProducts[0].internal_customer_id,
		productIds,
		internalProductIds,
		internalEntityId:
			internalEntityIds.length === 1 ? internalEntityIds[0] : undefined,
		status: expandedInvoice.status as InvoiceStatus,
		org,
		items: invoiceItems,
	});

	logger.info(
		`[invoice.finalized] Created Autumn invoice for Stripe invoice ${stripeInvoice.id}`,
	);
};
