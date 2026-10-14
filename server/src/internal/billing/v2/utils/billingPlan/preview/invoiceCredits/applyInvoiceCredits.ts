import type { PreviewInvoiceCredits } from "@autumn/shared";
import { Decimal } from "decimal.js";

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
