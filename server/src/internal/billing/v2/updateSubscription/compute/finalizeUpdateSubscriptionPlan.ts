import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";

export const finalizeUpdateSubscriptionPlan = ({
	plan,
    billingContext,
}: {
	plan: AutumnBillingPlan;
    billingContext: BillingContext;
}): AutumnBillingPlan => {

	if (billingContext.stripeDiscounts?.length) {
		plan.lineItems = applyStripeDiscountsToLineItems({
			lineItems: plan.lineItems,
			discounts: billingContext.stripeDiscounts,
		});
	}
	return plan;
};