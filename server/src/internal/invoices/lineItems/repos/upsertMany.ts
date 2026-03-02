import { type InsertDbInvoiceLineItem, invoiceLineItems } from "@autumn/shared";
import { buildConflictUpdateColumns } from "@/db/dbUtils.js";
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
	if (itemsWithStripeId.length > 0) {
		const updateColumns = buildConflictUpdateColumns(invoiceLineItems, [
			"id",
			"created_at",
		]);

		for (const lineItem of itemsWithStripeId) {
			await db.insert(invoiceLineItems).values(lineItem).onConflictDoUpdate({
				target: invoiceLineItems.stripe_id,
				set: updateColumns,
			});
		}
	}

	// Plain insert for items without stripe_id (no conflict possible)
	if (itemsWithoutStripeId.length > 0) {
		await db.insert(invoiceLineItems).values(itemsWithoutStripeId);
	}
};
