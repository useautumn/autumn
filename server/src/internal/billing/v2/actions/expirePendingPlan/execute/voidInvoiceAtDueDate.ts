import type { Metadata } from "@autumn/shared";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import type { RepoContext } from "@/db/repoContext";
import { MetadataService } from "@/internal/metadata/MetadataService";

const PENDING_PAYMENT_ERROR = "pending payments waiting to clear";
// Stripe still accepts payment on an uncollectible invoice, so only a void is final.
const VOIDABLE_STATUSES = new Set(["open", "uncollectible"]);

const isPendingPaymentError = (error: unknown) =>
	error instanceof Error && error.message.includes(PENDING_PAYMENT_ERROR);

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
	if (stripeInvoice.status === "void") return true;
	if (!VOIDABLE_STATUSES.has(stripeInvoice.status ?? "")) return false;

	try {
		await stripeCli.invoices.voidInvoice(stripeInvoice.id);
		ctx.logger.info(
			`[voidInvoiceAtDueDate] Voided invoice ${stripeInvoice.id}`,
		);
		return true;
	} catch (error) {
		if (!isPendingPaymentError(error)) throw error;

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
