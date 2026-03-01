import { type InsertDbInvoiceLineItem, invoiceLineItems } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";

/**
 * Upserts invoice line items by stripe_id.
 * For items with a stripe_id, uses ON CONFLICT DO UPDATE on the stripe_id unique index.
 * For items without a stripe_id (null), falls back to plain insert.
 */
export const upsertMany = async ({
	db,
	lineItems,
}: {
	db: DrizzleCli;
	lineItems: InsertDbInvoiceLineItem[];
}): Promise<void> => {
	if (lineItems.length === 0) return;

	// Separate items with and without stripe_id
	const itemsWithStripeId = lineItems.filter((li) => li.stripe_id != null);
	const itemsWithoutStripeId = lineItems.filter((li) => li.stripe_id == null);

	// Upsert items with stripe_id (can conflict on unique index)
	for (const lineItem of itemsWithStripeId) {
		await db
			.insert(invoiceLineItems)
			.values(lineItem)
			.onConflictDoUpdate({
				target: invoiceLineItems.stripe_id,
				set: {
					// Update all fields except id and created_at
					invoice_id: lineItem.invoice_id,
					stripe_invoice_id: lineItem.stripe_invoice_id,
					stripe_subscription_item_id: lineItem.stripe_subscription_item_id,
					stripe_product_id: lineItem.stripe_product_id,
					stripe_price_id: lineItem.stripe_price_id,
					stripe_discountable: lineItem.stripe_discountable,
					amount: lineItem.amount,
					amount_after_discounts: lineItem.amount_after_discounts,
					currency: lineItem.currency,
					stripe_quantity: lineItem.stripe_quantity,
					total_quantity: lineItem.total_quantity,
					paid_quantity: lineItem.paid_quantity,
					description: lineItem.description,
					description_source: lineItem.description_source,
					direction: lineItem.direction,
					billing_timing: lineItem.billing_timing,
					prorated: lineItem.prorated,
					price_id: lineItem.price_id,
					customer_product_ids: lineItem.customer_product_ids,
					customer_price_ids: lineItem.customer_price_ids,
					customer_entitlement_ids: lineItem.customer_entitlement_ids,
					internal_product_id: lineItem.internal_product_id,
					product_id: lineItem.product_id,
					internal_feature_id: lineItem.internal_feature_id,
					feature_id: lineItem.feature_id,
					effective_period_start: lineItem.effective_period_start,
					effective_period_end: lineItem.effective_period_end,
					discounts: lineItem.discounts,
				},
			});
	}

	// Plain insert for items without stripe_id (no conflict possible)
	if (itemsWithoutStripeId.length > 0) {
		await db.insert(invoiceLineItems).values(itemsWithoutStripeId);
	}
};
