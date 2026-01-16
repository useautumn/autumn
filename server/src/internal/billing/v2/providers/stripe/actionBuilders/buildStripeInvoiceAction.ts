import type { LineItem } from "@autumn/shared";
import type { StripeInvoiceAction } from "../../../types/billingPlan";
import { lineItemsToInvoiceAddLinesParams } from "../utils/invoiceLines/lineItemsToInvoiceAddLinesParams";

/**
 * Builds a StripeInvoiceAction for immediate charges.
 * Filters for line items where chargeImmediately === true.
 * Returns undefined if no immediate line items are provided.
 */
export const buildStripeInvoiceAction = ({
	lineItems,
}: {
	lineItems: LineItem[];
}): StripeInvoiceAction | undefined => {
	const immediateLineItems = lineItems.filter(
		(line) => line.chargeImmediately === true,
	);

	if (immediateLineItems.length === 0) {
		return undefined;
	}

	const lines = lineItemsToInvoiceAddLinesParams({
		lineItems: immediateLineItems,
	});

	if (lines.length === 0) {
		return undefined;
	}

	return {
		addLineParams: { lines },
	};
};
