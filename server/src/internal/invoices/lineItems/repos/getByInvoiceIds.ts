import { invoiceLineItems } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export const getByInvoiceIds = async ({
	db,
	invoiceIds,
}: {
	db: DrizzleCli;
	invoiceIds: string[];
}) => {
	if (invoiceIds.length === 0) {
		return [];
	}

	return db
		.select()
		.from(invoiceLineItems)
		.where(inArray(invoiceLineItems.invoice_id, invoiceIds));
};
