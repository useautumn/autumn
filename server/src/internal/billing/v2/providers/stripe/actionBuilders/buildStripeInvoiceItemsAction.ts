import type {
	BillingContext,
	LineItem,
	StripeInvoiceItemsAction,
} from "@autumn/shared";
import { lineItemsToCreateInvoiceItemsParams } from "../utils/invoiceLines/lineItemsToCreateInvoiceItemsParams";

/**
 * Builds a StripeInvoiceItemsAction for deferred charges (added to next cycle).
 * Filters for line items where chargeImmediately === false.
 * Returns undefined if no deferred line items are provided.
 */
export const buildStripeInvoiceItemsAction = ({
	lineItems,
	billingContext,
}: {
	lineItems: LineItem[];
	billingContext: BillingContext;
}): StripeInvoiceItemsAction | undefined => {
	const deferredLineItems = lineItems.filter(
		(line) => line.chargeImmediately === false && line.amount !== 0,
	);

	if (deferredLineItems.length === 0) {
		return undefined;
	}

	const stripeCustomerId = billingContext.stripeCustomer?.id;
	const stripeSubscriptionId = billingContext.stripeSubscription?.id;

	const createInvoiceItems = lineItemsToCreateInvoiceItemsParams({
		stripeCustomerId,
		stripeSubscriptionId,
		lineItems: deferredLineItems,
	});

	if (createInvoiceItems.length === 0) {
		return undefined;
	}

	return {
		createInvoiceItems,
	};
};
