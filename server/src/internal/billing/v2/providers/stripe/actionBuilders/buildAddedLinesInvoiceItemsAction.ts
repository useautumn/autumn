import type {
	BillingContext,
	LineItem,
	StripeInvoiceItemsAction,
} from "@autumn/shared";
import { isCustomLineItem } from "@/internal/billing/v2/utils/lineItems/isCustomLineItem";
import { lineItemsToCreateInvoiceItemsParams } from "../utils/invoiceLines/lineItemsToCreateInvoiceItemsParams";

/** Pending invoice items for add_lines, which Stripe sweeps into the invoice the subscription action creates. */
export const buildAddedLinesInvoiceItemsAction = ({
	lineItems,
	billingContext,
}: {
	lineItems: LineItem[];
	billingContext: BillingContext;
}): StripeInvoiceItemsAction | undefined => {
	const addedLineItems = lineItems.filter(
		(lineItem) =>
			isCustomLineItem(lineItem) &&
			lineItem.chargeImmediately &&
			lineItem.amount !== 0,
	);
	if (addedLineItems.length === 0) return undefined;

	return {
		createInvoiceItems: lineItemsToCreateInvoiceItemsParams({
			stripeCustomerId: billingContext.stripeCustomer?.id ?? "none",
			stripeSubscriptionId: billingContext.stripeSubscription?.id,
			lineItems: addedLineItems,
		}),
	};
};
