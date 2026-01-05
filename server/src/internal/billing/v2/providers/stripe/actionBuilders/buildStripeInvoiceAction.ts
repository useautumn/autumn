import type { LineItem } from "@autumn/shared";
import type {
	InvoiceMode,
	StripeInvoiceAction,
} from "../../../types/billingPlan";
import { lineItemsToStripeLines } from "../utils/invoiceLines/lineItemsToStripeLines";

/**
 * Builds a Stripe invoice action from Autumn line items.
 * Returns undefined if no line items are provided.
 */
export const buildStripeInvoiceAction = ({
	autumnLineItems,
	invoiceMode,
}: {
	autumnLineItems: LineItem[];
	invoiceMode?: InvoiceMode;
}): StripeInvoiceAction | undefined => {
	if (autumnLineItems.length === 0) {
		return undefined;
	}

	const lines = lineItemsToStripeLines({ lineItems: autumnLineItems });

	return {
		addLineParams: { lines },
		invoiceMode,
	};
};
