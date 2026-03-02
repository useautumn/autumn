import {
	type AutumnBillingPlan,
	type BillingContext,
	type CustomLineItem,
	filterUnchangedPricesFromLineItems,
	type LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildSharedSubscriptionTrialLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildSharedSubscriptionTrialLineItems";
import { filterLineItemsForTrialTransition } from "@/internal/billing/v2/compute/computeAutumnUtils/filterLineItemsForTrialTransition";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";

/**
 * Finalizes line items for a billing plan by:
 * 1. If custom line items are provided, overrides computed line items entirely
 * 2. Filtering line items based on trial state transitions
 * 3. Filtering out unchanged prices (refund + charge pairs that cancel out)
 * 4. Adding line items for sibling products affected by trial state changes
 * 5. Applying Stripe discounts to line items
 */
export const finalizeLineItems = ({
	ctx,
	lineItems,
	billingContext,
	autumnBillingPlan,
	customLineItems,
}: {
	ctx: AutumnContext;
	lineItems: LineItem[];
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	customLineItems?: CustomLineItem[];
}): LineItem[] => {
	// 0. If custom line items provided, override computed line items entirely
	if (customLineItems?.length) {
		autumnBillingPlan.customLineItems = customLineItems;
		return [];
	}

	// 1. Filter line items based on trial state transitions
	let finalizedLineItems = filterLineItemsForTrialTransition({
		ctx,
		lineItems,
		billingContext,
	});

	// 2. Filter out unchanged prices (refund + charge pairs that cancel out)
	finalizedLineItems = filterUnchangedPricesFromLineItems({
		lineItems: finalizedLineItems,
	});

	// 3. Add line items for sibling products affected by trial state changes
	const sharedTrialLineItems = buildSharedSubscriptionTrialLineItems({
		ctx,
		billingContext,
		autumnBillingPlan,
	});
	finalizedLineItems = [...finalizedLineItems, ...sharedTrialLineItems];

	// 4. Apply Stripe discounts if present
	if (billingContext.stripeDiscounts?.length) {
		finalizedLineItems = applyStripeDiscountsToLineItems({
			lineItems: finalizedLineItems,
			discounts: billingContext.stripeDiscounts,
		});
	}

	return finalizedLineItems;
};
