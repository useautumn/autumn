import {
	atmnToStripeAmount,
	type CustomLineItem,
	type LineItem,
	type StripeInvoiceAction,
} from "@autumn/shared";

import { lineItemsToInvoiceAddLinesParams } from "../utils/invoiceLines/lineItemsToInvoiceAddLinesParams";

/**
 * Builds a StripeInvoiceAction for immediate charges.
 * If customLineItems are provided, uses those directly (bypasses normal LineItem conversion).
 * Otherwise filters for line items where chargeImmediately === true.
 */
export const buildStripeInvoiceAction = ({
	lineItems,
	customLineItems,
	currency,
}: {
	lineItems?: LineItem[];
	customLineItems?: CustomLineItem[];
	currency?: string;
}): StripeInvoiceAction | undefined => {
	// Custom line items bypass the normal LineItem → Stripe conversion
	if (customLineItems?.length && currency) {
		const lines = customLineItems.map((item) => ({
			amount: atmnToStripeAmount({ amount: item.amount, currency }),
			description: item.description,
		}));

		return { addLineParams: { lines } };
	}

	if (!lineItems) {
		return undefined;
	}

	const immediateLineItems = lineItems.filter(
		(line) => line.chargeImmediately === true && line.amount !== 0,
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
