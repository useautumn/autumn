import { type DbInvoiceLineItem, invoiceLineItems } from "@autumn/shared";
import { eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

/**
 * Fetches deferred line items that match the given stripe_invoice_item_ids
 * and haven't been assigned to an invoice yet (invoice_id IS NULL).
 */
export const getDeferredByInvoiceItemIds = async ({
	db,
	stripeInvoiceItemIds,
}: {
	db: DrizzleCli;
	stripeInvoiceItemIds: string[];
}): Promise<DbInvoiceLineItem[]> => {
	if (stripeInvoiceItemIds.length === 0) return [];

	return db
		.select()
		.from(invoiceLineItems)
		.where(
			inArray(invoiceLineItems.stripe_invoice_item_id, stripeInvoiceItemIds),
		);
};

/**
 * Updates a deferred line item with invoice info and refreshed Stripe fields
 * when the renewal invoice arrives.
 */
export const updateDeferredLineItem = async ({
	db,
	id,
	updates,
}: {
	db: DrizzleCli;
	id: string;
	updates: {
		invoice_id: string;
		stripe_invoice_id: string;
		stripe_id: string;
		amount: number;
		amount_after_discounts: number;
		stripe_quantity: number | null;
	};
}): Promise<void> => {
	await db
		.update(invoiceLineItems)
		.set(updates)
		.where(eq(invoiceLineItems.id, id));
};
