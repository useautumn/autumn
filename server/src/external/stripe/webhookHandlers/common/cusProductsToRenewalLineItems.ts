import type { LineItem } from "@autumn/shared";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";
import { buildBillingContextForArrearInvoice } from "./buildBillingContextFromWebhook";

/**
 * Generates Autumn billing line items from customer products for a renewal invoice.
 *
 * Combines:
 * 1. In-advance line items (base price, prepaid, allocated) from `customerProductToLineItems`
 * 2. Arrear line items (consumable usage) passed in from `processConsumablePricesForInvoiceCreated`
 *
 * The arrear line items are passed in rather than generated here because they need to be
 * captured before `processConsumablePricesForInvoiceCreated` resets the cusEnt balances.
 */
export const cusProductsToRenewalLineItems = ({
	ctx,
	eventContext,
	arrearLineItems,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
	arrearLineItems: LineItem[];
}): LineItem[] => {
	const { customerProducts } = eventContext;
	const lineItems: LineItem[] = [];

	// Build billing context for line item generation
	const billingContext = buildBillingContextForArrearInvoice({ eventContext });

	// 1. In-advance line items (base, prepaid, allocated) for each cusProduct
	for (const cusProduct of customerProducts) {
		const productLineItems = customerProductToLineItems({
			ctx,
			customerProduct: cusProduct,
			billingContext,
			direction: "charge",
		});
		lineItems.push(...productLineItems);
	}

	// 2. Append arrear line items (already generated and passed in)
	lineItems.push(...arrearLineItems);

	return lineItems;
};
