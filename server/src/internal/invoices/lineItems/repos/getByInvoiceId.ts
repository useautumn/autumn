import { invoiceLineItems } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export const getByInvoiceId = async ({
	db,
	invoiceId,
}: {
	db: DrizzleCli;
	invoiceId: string;
}) => {
	return db
		.select()
		.from(invoiceLineItems)
		.where(eq(invoiceLineItems.invoice_id, invoiceId));
};
