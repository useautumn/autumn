import { type InsertDbInvoiceLineItem, invoiceLineItems } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

/**
 * Reconciles invoice line items by stripe_id with partial updates.
 *
 * For existing rows (matched by stripe_id): Updates only Stripe-authoritative fields,
 * preserving Autumn metadata (product_id, feature_id, billing_timing, etc.).
 *
 * For new rows (no matching stripe_id): Inserts the full row.
 *
 * This is used by invoice.finalized to update amounts/quantities without
 * overwriting the Autumn context that was set during invoice.created.
 *
 * Stripe-authoritative fields (updated):
 * - amount, amount_after_discounts, currency
 * - stripe_quantity
 * - discounts, stripe_discountable
 * - effective_period_start, effective_period_end
 * - description (only when description_source = "stripe")
 *
 * Autumn-authoritative fields (preserved):
 * - total_quantity, paid_quantity (computed from billing_units, not raw Stripe packs)
 * - product_id, internal_product_id
 * - feature_id, internal_feature_id
 * - price_id, billing_timing, direction, prorated
 * - customer_product_ids, customer_price_ids, customer_entitlement_ids
 * - description_source
 */
export const reconcileMany = async ({
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

	// Partial upsert for items with stripe_id
	// Only update Stripe-authoritative fields, preserve Autumn metadata
	if (itemsWithStripeId.length > 0) {
		for (const lineItem of itemsWithStripeId) {
			await db
				.insert(invoiceLineItems)
				.values(lineItem)
				.onConflictDoUpdate({
					target: invoiceLineItems.stripe_id,
					set: {
						// Stripe-authoritative: amounts
						amount: sql`excluded.amount`,
						amount_after_discounts: sql`excluded.amount_after_discounts`,
						currency: sql`excluded.currency`,

						// Stripe-authoritative: quantities (only stripe_quantity)
						// Note: total_quantity and paid_quantity are Autumn-authoritative
						// (computed from billing_units), so they are NOT updated here
						stripe_quantity: sql`excluded.stripe_quantity`,

						// Stripe-authoritative: discounts
						discounts: sql`excluded.discounts`,
						stripe_discountable: sql`excluded.stripe_discountable`,

						// Stripe-authoritative: period
						effective_period_start: sql`excluded.effective_period_start`,
						effective_period_end: sql`excluded.effective_period_end`,

						// Description: only update if incoming source is "stripe"
						// This preserves Autumn-sourced descriptions
						description: sql`CASE 
							WHEN excluded.description_source = 'stripe' THEN excluded.description 
							ELSE ${invoiceLineItems.description} 
						END`,

						// Note: All Autumn-authoritative fields are intentionally NOT updated:
						// - product_id, internal_product_id
						// - feature_id, internal_feature_id
						// - price_id, billing_timing, direction, prorated
						// - customer_product_ids, customer_price_ids, customer_entitlement_ids
						// - description_source
					},
				});
		}
	}

	// Plain insert for items without stripe_id (no conflict possible)
	if (itemsWithoutStripeId.length > 0) {
		await db.insert(invoiceLineItems).values(itemsWithoutStripeId);
	}
};
