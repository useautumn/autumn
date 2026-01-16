import { cp, isCustomerProductFree } from "@autumn/shared";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/autumnBillingPlan";

export const computeOneOffLineItems = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const { insertCustomerProducts } = autumnBillingPlan;
	const newCustomerProduct = insertCustomerProducts?.[0];
	if (!newCustomerProduct) return [];

	// Only allow one off items if going from free -> paid
	const currentIsFree = isCustomerProductFree(billingContext.customerProduct);
	const { valid: newIsPaidRecurring } = cp(newCustomerProduct)
		.paid()
		.recurring();

	const includeOneOffItems = currentIsFree && newIsPaidRecurring;

	if (!includeOneOffItems) return [];

	// const newOneOffItems = cusProductToLineItems({
	//   cusProduct: newCustomerProduct,
	//   nowMs: billingContext.currentEpochMs,
	//   billingCycleAnchorMs: billingContext.billingCycleAnchorMs,
	//   direction: "charge",
	//   org: billingContext.org,
	//   logger: billingContext.logger,
	// });
};
