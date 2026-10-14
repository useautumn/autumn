import { invoiceLineItems } from "@autumn/shared";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export const deleteStaleByStripeInvoiceId = async ({
	db,
	stripeInvoiceId,
	activeStripeIds,
}: {
	db: DrizzleCli;
	stripeInvoiceId: string;
	activeStripeIds: string[];
}): Promise<void> => {
	if (activeStripeIds.length === 0) {
		await db
			.delete(invoiceLineItems)
			.where(
				and(
					eq(invoiceLineItems.stripe_invoice_id, stripeInvoiceId),
					isNotNull(invoiceLineItems.stripe_id),
				),
			);
		return;
	}

	await db
		.delete(invoiceLineItems)
		.where(
			and(
				eq(invoiceLineItems.stripe_invoice_id, stripeInvoiceId),
				isNotNull(invoiceLineItems.stripe_id),
				notInArray(invoiceLineItems.stripe_id, activeStripeIds),
			),
		);
};
