import {
	cusProductsToPrices,
	type FullCusProduct,
	isOneOffProduct,
	type LineItem,
} from "@autumn/shared";
import type { AttachContext, StripeSubAction } from "../../typesOld";
import { applyStripeDiscountsToLineItems } from "../../utils/stripeAdapter/applyStripeDiscounts/applyStripeDiscountsToLineItems";
import { subToDiscounts } from "../../utils/stripeAdapter/applyStripeDiscounts/subToDiscounts";
import { lineItemsToStripeLines } from "../../utils/stripeAdapter/invoiceLines/lineItemsToStripeLines";

export const buildStripeInvoiceAction = ({
	attachContext,
	autumnLineItems,
	stripeSubAction,
	newCusProducts,
}: {
	attachContext: AttachContext;
	autumnLineItems: LineItem[];
	stripeSubAction: StripeSubAction;
	newCusProducts: FullCusProduct[];
}) => {
	const { stripeSub } = attachContext;

	const subDiscounts = stripeSub ? subToDiscounts({ sub: stripeSub }) : [];

	const lineItemsAfterDiscounts = applyStripeDiscountsToLineItems({
		lineItems: autumnLineItems,
		discounts: subDiscounts,
	});

	const stripeInvoiceItems = lineItemsToStripeLines({
		lineItems: lineItemsAfterDiscounts,
	});

	// If sub is being updated, we need to create an invoice to pay for the new items
	if (stripeSubAction.type === "update") {
		return {
			items: stripeInvoiceItems,
			onPaymentFailure: "return_url" as const,
		};
	}

	// One off prices
	const newPrices = cusProductsToPrices({ cusProducts: newCusProducts });
	if (isOneOffProduct({ prices: newPrices })) {
		return {
			items: stripeInvoiceItems,
			onPaymentFailure: "checkout_session" as const,
		};
	}

	return undefined;
};
