import { filterUnchangedPricesFromLineItems } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import { buildSharedSubscriptionTrialLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildSharedSubscriptionTrialLineItems";
import { filterLineItemsForTrialTransition } from "@/internal/billing/v2/compute/computeAutumnUtils/filterLineItemsForTrialTransition";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";

export const finalizeUpdateSubscriptionPlan = ({
	ctx,
	plan,
	billingContext,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	billingContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	// Filter line items based on trial state transitions
	plan.lineItems = filterLineItemsForTrialTransition({
		ctx,
		lineItems: plan.lineItems,
		billingContext,
	});

	// Filter out unchanged prices (refund + charge pairs that cancel out)
	plan.lineItems = filterUnchangedPricesFromLineItems({
		lineItems: plan.lineItems,
	});

	// Add line items for sibling products affected by trial state changes
	const sharedTrialLineItems = buildSharedSubscriptionTrialLineItems({
		ctx,
		billingContext,
		autumnBillingPlan: plan,
	});
	plan.lineItems = [...plan.lineItems, ...sharedTrialLineItems];

	// Apply discounts
	if (billingContext.stripeDiscounts?.length) {
		plan.lineItems = applyStripeDiscountsToLineItems({
			lineItems: plan.lineItems,
			discounts: billingContext.stripeDiscounts,
		});
	}

	return plan;
};
