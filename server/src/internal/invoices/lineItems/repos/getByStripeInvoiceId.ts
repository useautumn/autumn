import { invoiceLineItems } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export const getByStripeInvoiceId = async ({
	db,
	stripeInvoiceId,
}: {
	db: DrizzleCli;
	stripeInvoiceId: string;
}) => {
	return db
		.select()
		.from(invoiceLineItems)
		.where(eq(invoiceLineItems.stripe_invoice_id, stripeInvoiceId));
};
