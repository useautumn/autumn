import { generateKsuid } from "@autumn/ksuid";
import {
	type InsertDbInvoiceLineItem,
	type LineItem,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type { Stripe } from "stripe";
import { billingLineItemToInsertDbLineItem } from "@/internal/billing/v2/utils/lineItems/billingLineItemToDbLineItem";

/**
 * Converts a Stripe invoice line item to an Autumn DB invoice line item.
 *
 * Matching strategy:
 * 1. If `metadata.autumn_line_item_id` exists → Find matching Autumn LineItem by ID (full match)
 * 2. Otherwise → Create from Stripe data only (fallback, minimal data)
 *
 * This unified function handles both:
 * - Autumn-generated invoices (billing v2) - Full match via ID
 * - Stripe-generated invoices (webhooks) - Fallback match
 */
export const stripeLineItemToDbLineItem = ({
	stripeLineItem,
	invoiceId,
	stripeInvoiceId,
	autumnLineItems,
}: {
	stripeLineItem: Stripe.InvoiceLineItem;
	invoiceId: string;
	stripeInvoiceId: string;
	autumnLineItems?: LineItem[];
}): InsertDbInvoiceLineItem => {
	const metadata = stripeLineItem.metadata;

	// 1. Try to match by autumn_line_item_id in metadata
	const autumnLineItemId = metadata?.autumn_line_item_id;
	const matchedLineItem = autumnLineItemId
		? autumnLineItems?.find((li) => li.id === autumnLineItemId)
		: undefined;

	if (matchedLineItem) {
		// Full match - use all Autumn context
		return billingLineItemToInsertDbLineItem({
			lineItem: matchedLineItem,
			invoiceId,
			stripeInvoiceId,
			stripeLineItemId: stripeLineItem.id,
		});
	}

	// 2. Fallback: Create from Stripe data only (minimal data)
	// Handles Stripe-generated line items (subscriptions, prorations)
	return createFromStripeLineItem({
		stripeLineItem,
		invoiceId,
		stripeInvoiceId,
	});
};

/**
 * Helper for fallback case - creates an InsertDbInvoiceLineItem from Stripe data only.
 * Used when we can't match to an Autumn LineItem (e.g., Stripe-generated line items).
 */
const createFromStripeLineItem = ({
	stripeLineItem,
	invoiceId,
	stripeInvoiceId,
}: {
	stripeLineItem: Stripe.InvoiceLineItem;
	invoiceId: string;
	stripeInvoiceId: string;
}): InsertDbInvoiceLineItem => {
	const metadata = stripeLineItem.metadata;

	return {
		id: generateKsuid({ prefix: "invoice_li_" }),
		invoice_id: invoiceId,
		stripe_id: stripeLineItem.id,
		stripe_invoice_id: stripeInvoiceId,
		stripe_product_id:
			(stripeLineItem.pricing?.price_details?.product as string) ?? null,
		stripe_price_id: stripeLineItem.pricing?.price_details?.price ?? null,
		stripe_discountable: stripeLineItem.discountable ?? true,

		amount: stripeToAtmnAmount({
			amount: stripeLineItem.amount,
			currency: stripeLineItem.currency,
		}),
		amount_after_discounts: stripeToAtmnAmount({
			amount: stripeLineItem.amount,
			currency: stripeLineItem.currency,
		}),
		currency: stripeLineItem.currency,

		total_quantity: stripeLineItem.quantity ?? null,
		paid_quantity: stripeLineItem.quantity ?? null,

		description: stripeLineItem.description ?? "",
		direction: stripeLineItem.amount >= 0 ? "charge" : "refund",
		billing_timing: null,
		prorated: false,

		// Extract from metadata if available
		price_id: metadata?.autumn_price_id ?? null,
		customer_product_id: null,
		customer_entitlement_id: null,
		internal_product_id: null,
		product_id: metadata?.autumn_product_id ?? null,
		internal_feature_id: null,
		feature_id: null,

		effective_period_start: stripeLineItem.period?.start
			? stripeLineItem.period.start * 1000
			: null,
		effective_period_end: stripeLineItem.period?.end
			? stripeLineItem.period.end * 1000
			: null,

		discounts: [],
	};
};
