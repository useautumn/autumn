import type { Metadata } from "@autumn/shared";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import type { RepoContext } from "@/db/repoContext";
import { isStripeInvoicePendingPaymentError } from "@/external/stripe/invoices/utils/classifyStripeInvoice";
import { MetadataService } from "@/internal/metadata/MetadataService";

const UNPAID_CLOSED_STATUSES = new Set(["void", "uncollectible"]);

/** Returns whether the invoice is now closed unpaid; a clearing payment defers cleanup a day. */
export const voidInvoiceAtDueDate = async ({
	ctx,
	stripeCli,
	metadata,
	stripeInvoice,
}: {
	ctx: RepoContext;
	stripeCli: Stripe;
	metadata: Metadata;
	stripeInvoice: Stripe.Invoice;
}): Promise<boolean> => {
	if (UNPAID_CLOSED_STATUSES.has(stripeInvoice.status ?? "")) return true;
	if (stripeInvoice.status !== "open") return false;

	try {
		await stripeCli.invoices.voidInvoice(stripeInvoice.id);
		ctx.logger.info(
			`[voidInvoiceAtDueDate] Voided invoice ${stripeInvoice.id}`,
		);
		return true;
	} catch (error) {
		if (!isStripeInvoicePendingPaymentError(error)) throw error;

		await MetadataService.update({
			db: ctx.db,
			id: metadata.id,
			updates: { expires_at: addDays(Date.now(), 1).getTime() },
		});
		ctx.logger.info(
			`[voidInvoiceAtDueDate] Invoice ${stripeInvoice.id} has a pending payment; retrying in 24 hours`,
		);
		return false;
	}
};
