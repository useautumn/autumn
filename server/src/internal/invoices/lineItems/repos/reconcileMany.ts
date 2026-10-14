import { type InsertDbInvoiceLineItem, invoiceLineItems } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export const reconcileMany = async ({
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
		for (const lineItem of itemsWithStripeId) {
			await db
				.insert(invoiceLineItems)
				.values(lineItem)
				.onConflictDoUpdate({
					target: invoiceLineItems.stripe_id,
					set: {
						amount: sql`excluded.amount`,
						amount_after_discounts: sql`excluded.amount_after_discounts`,
						currency: sql`excluded.currency`,

						stripe_quantity: sql`excluded.stripe_quantity`,

						discounts: sql`excluded.discounts`,
						stripe_discountable: sql`excluded.stripe_discountable`,

						effective_period_start: sql`excluded.effective_period_start`,
						effective_period_end: sql`excluded.effective_period_end`,

						description: sql`CASE 
							WHEN excluded.description_source = 'stripe' THEN excluded.description 
							ELSE ${invoiceLineItems.description} 
						END`,
					},
				});
		}
	}

	if (itemsWithoutStripeId.length > 0) {
		await db.insert(invoiceLineItems).values(itemsWithoutStripeId);
	}
};
