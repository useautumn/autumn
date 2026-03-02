import { type InsertDbInvoiceLineItem, invoiceLineItems } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";

export const insertMany = async ({
	db,
	lineItems,
}: {
	db: DrizzleCli;
	lineItems: InsertDbInvoiceLineItem[];
}): Promise<void> => {
	if (lineItems.length === 0) return;

	await db.insert(invoiceLineItems).values(lineItems);
};
