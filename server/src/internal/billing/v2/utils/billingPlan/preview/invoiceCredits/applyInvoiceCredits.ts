import type { PreviewInvoiceCredits } from "@autumn/shared";
import { Decimal } from "decimal.js";

/**
 * Splits an invoice total into the credit it consumes and what the customer
 * still owes. Credit never exceeds the total, so a $10 invoice against $100 of
 * credit leaves $90 on the customer rather than a negative amount due.
 */
export const applyInvoiceCredits = ({
	total,
	credits,
}: {
	total: number;
	credits?: PreviewInvoiceCredits;
}): { credits?: PreviewInvoiceCredits; amountDue: number } => {
	const payable = Decimal.max(total, 0);
	if (!credits || credits.balance <= 0) {
		return {
			credits: credits ? { ...credits, applied: 0 } : undefined,
			amountDue: payable.toDP(2).toNumber(),
		};
	}

	const applied = Decimal.min(credits.balance, payable);
	return {
		credits: { ...credits, applied: applied.toDP(2).toNumber() },
		amountDue: payable.minus(applied).toDP(2).toNumber(),
	};
};
