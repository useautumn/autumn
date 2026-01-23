import { filterUnchangedPricesFromLineItems } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";
import type { AttachBillingContext } from "../types/attachBillingContext";

/**
 * Finalizes the attach billing plan by:
 * 1. Filtering out unchanged prices (refund + charge pairs that cancel out)
 * 2. Applying Stripe discounts to line items
 */
export const finalizeAttachPlan = ({
	ctx: _ctx,
	plan,
	attachBillingContext,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	attachBillingContext: AttachBillingContext;
}): AutumnBillingPlan => {
	// 1. Filter out unchanged prices (refund + charge pairs that cancel out)
	plan.lineItems = filterUnchangedPricesFromLineItems({
		lineItems: plan.lineItems ?? [],
	});

	// 2. Apply Stripe discounts if present
	if (attachBillingContext.stripeDiscounts?.length) {
		plan.lineItems = applyStripeDiscountsToLineItems({
			lineItems: plan.lineItems ?? [],
			discounts: attachBillingContext.stripeDiscounts,
		});
	}

	return plan;
};
