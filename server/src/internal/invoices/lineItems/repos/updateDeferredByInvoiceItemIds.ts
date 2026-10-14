import { type DbInvoiceLineItem, invoiceLineItems } from "@autumn/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

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
			and(
				inArray(invoiceLineItems.stripe_invoice_item_id, stripeInvoiceItemIds),
				isNull(invoiceLineItems.invoice_id),
			),
		);
};

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
