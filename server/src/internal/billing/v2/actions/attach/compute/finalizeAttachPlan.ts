import type { AttachBillingContext, AutumnBillingPlan } from "@autumn/shared";
import { filterUnchangedPricesFromLineItems } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { filterLineItemsForTrialTransition } from "@/internal/billing/v2/compute/computeAutumnUtils/filterLineItemsForTrialTransition";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";

/**
 * Finalizes the attach billing plan by:
 * 1. Filtering line items based on trial state transitions
 * 2. Filtering out unchanged prices (refund + charge pairs that cancel out)
 * 3. Applying Stripe discounts to line items
 */
export const finalizeAttachPlan = ({
	ctx,
	plan,
	attachBillingContext,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	attachBillingContext: AttachBillingContext;
}): AutumnBillingPlan => {
	// 1. Filter line items based on trial state transitions
	// (removes charges when starting a trial)
	plan.lineItems = filterLineItemsForTrialTransition({
		ctx,
		lineItems: plan.lineItems ?? [],
		billingContext: attachBillingContext,
	});

	// 2. Filter out unchanged prices (refund + charge pairs that cancel out)
	plan.lineItems = filterUnchangedPricesFromLineItems({
		lineItems: plan.lineItems ?? [],
	});

	// 3. Apply Stripe discounts if present
	if (attachBillingContext.stripeDiscounts?.length) {
		plan.lineItems = applyStripeDiscountsToLineItems({
			lineItems: plan.lineItems ?? [],
			discounts: attachBillingContext.stripeDiscounts,
		});
	}

	return plan;
};
