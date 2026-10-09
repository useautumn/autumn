import type { Stripe } from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { markCustomersUpdatedAtByInternalIds } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";
import { InvoiceService } from "../InvoiceService";

/**
 * Mirrors a void/uncollectible Stripe status onto the Autumn invoice row
 * directly, so the row never depends on the org's webhook endpoint being
 * subscribed to invoice.updated.
 */
export const syncClosedInvoiceStatus = async ({
	db,
	stripeInvoice,
}: {
	db: DrizzleCli;
	stripeInvoice: Stripe.Invoice;
}) => {
	if (
		stripeInvoice.status !== "void" &&
		stripeInvoice.status !== "uncollectible"
	)
		return null;

	const updatedInvoice = await InvoiceService.update({
		db,
		query: { stripeId: stripeInvoice.id },
		updates: { status: stripeInvoice.status },
	});

	if (updatedInvoice) {
		await markCustomersUpdatedAtByInternalIds({
			db,
			internalCustomerIds: [updatedInvoice.internal_customer_id],
		});
	}

	return updatedInvoice;
};
