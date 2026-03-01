import { invoiceLineItems } from "@autumn/shared";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

/**
 * Deletes invoice line items for a stripe_invoice_id that are no longer in Stripe.
 * Used for reconciliation: removes line items that were deleted between invoice.created and invoice.finalized.
 *
 * Only deletes items that have a stripe_id (Stripe-sourced items).
 * Items without a stripe_id (e.g., manually added) are not affected.
 */
export const deleteStaleByStripeInvoiceId = async ({
	db,
	stripeInvoiceId,
	activeStripeIds,
}: {
	db: DrizzleCli;
	stripeInvoiceId: string;
	activeStripeIds: string[];
}): Promise<void> => {
	// If no active IDs, delete all items with a stripe_id for this invoice
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

	// Delete items whose stripe_id is NOT in the active set
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
