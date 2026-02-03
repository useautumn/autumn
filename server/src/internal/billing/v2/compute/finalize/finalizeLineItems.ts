import {
	type AutumnBillingPlan,
	type BillingContext,
	filterUnchangedPricesFromLineItems,
	type LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildSharedSubscriptionTrialLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildSharedSubscriptionTrialLineItems";
import { filterLineItemsForTrialTransition } from "@/internal/billing/v2/compute/computeAutumnUtils/filterLineItemsForTrialTransition";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";

/**
 * Finalizes line items for a billing plan by:
 * 1. Filtering line items based on trial state transitions
 * 2. Filtering out unchanged prices (refund + charge pairs that cancel out)
 * 3. Adding line items for sibling products affected by trial state changes
 * 4. Applying Stripe discounts to line items
 */
export const finalizeLineItems = ({
	ctx,
	lineItems,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	lineItems: LineItem[];
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}): LineItem[] => {
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
