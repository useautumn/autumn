import { invoiceLineItems } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export const deleteByInvoiceId = async ({
	db,
	invoiceId,
}: {
	db: DrizzleCli;
	invoiceId: string;
}): Promise<void> => {
	await db
		.delete(invoiceLineItems)
		.where(eq(invoiceLineItems.invoice_id, invoiceId));
};
