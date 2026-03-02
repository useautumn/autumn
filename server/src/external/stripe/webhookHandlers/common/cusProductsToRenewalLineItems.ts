import type { LineItem } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";
import {
	type BaseWebhookEventContext,
	buildBillingContextForInAdvanceInvoice,
} from "./buildBillingContextFromWebhook";

/**
 * Generates Autumn billing line items from customer products for a renewal invoice.
 *
 * Combines:
 * 1. In-advance line items (base price, prepaid, allocated) from `customerProductToLineItems`
 * 2. Arrear line items (consumable usage) passed in from `processConsumablePricesForInvoiceCreated`
 *
 * The arrear line items are passed in rather than generated here because they need to be
 * captured before `processConsumablePricesForInvoiceCreated` resets the cusEnt balances.
 *
 * @param periodEndMs - The billing period boundary (from `stripeInvoice.period_end * 1000`).
 *   This is used as `currentEpochMs` for in-advance line items, placing us at the start
 *   of the new cycle so billing period calculation returns the correct upcoming cycle.
 */
export const cusProductsToRenewalLineItems = ({
	ctx,
	eventContext,
	arrearLineItems,
	periodEndMs,
}: {
	ctx: StripeWebhookContext;
	eventContext: BaseWebhookEventContext;
	arrearLineItems: LineItem[];
	periodEndMs: number;
}): LineItem[] => {
	const { customerProducts } = eventContext;
	const lineItems: LineItem[] = [];

	// Build billing context for in-advance line items
	// Uses periodEndMs directly (the new cycle start) so billing period calculation
	// returns the upcoming cycle, not the just-ended cycle
	const billingContext = buildBillingContextForInAdvanceInvoice({
		eventContext,
		periodEndMs,
	});

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
