import { type InsertDbInvoiceLineItem, invoiceLineItems } from "@autumn/shared";
import { buildConflictUpdateColumns } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle";

export const upsertMany = async ({
	db,
	lineItems,
}: {
	db: DrizzleCli;
	lineItems: InsertDbInvoiceLineItem[];
}): Promise<void> => {
	if (lineItems.length === 0) return;

	const itemsWithStripeId = lineItems.filter((li) => li.stripe_id != null);
	const itemsWithoutStripeId = lineItems.filter((li) => li.stripe_id == null);

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

	if (itemsWithoutStripeId.length > 0) {
		await db.insert(invoiceLineItems).values(itemsWithoutStripeId);
	}
};
