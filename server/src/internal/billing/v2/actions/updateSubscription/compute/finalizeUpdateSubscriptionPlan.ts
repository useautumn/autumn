import {
	filterUnchangedPricesFromLineItems,
	isCustomerProductOneOff,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@autumn/shared";
import { buildSharedSubscriptionTrialLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildSharedSubscriptionTrialLineItems";
import { filterLineItemsForTrialTransition } from "@/internal/billing/v2/compute/computeAutumnUtils/filterLineItemsForTrialTransition";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";
import type { AutumnBillingPlan } from "@autumn/shared";

export const finalizeUpdateSubscriptionPlan = ({
	ctx,
	plan,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV0Params;
}): AutumnBillingPlan => {
	// Filter line items based on trial state transitions
	plan.lineItems = filterLineItemsForTrialTransition({
		ctx,
		lineItems: plan.lineItems ?? [],
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

	// Guard: if current customer product is one off, make sure there are no line items.
	if (isCustomerProductOneOff(billingContext.customerProduct)) {
		plan.lineItems = [];
	}

	// Guard: if billing_behavior is 'next_cycle_only', clear line items (skip proration charges)
	if (params.billing_behavior === "next_cycle_only") {
		plan.lineItems = [];
	}

	return plan;
};
