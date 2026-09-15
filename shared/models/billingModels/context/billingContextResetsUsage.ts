import type { CarryOverUsages } from "../../../api/billing/common/carryOverUsages.js";
import { UpdateSubscriptionIntent } from "./updateSubscriptionBillingContext.js";

/** Shared usage-reset policy for computation and preview. */
export const billingContextResetsUsage = (billingContext: unknown): boolean => {
	const context = billingContext as {
		carryOverUsages?: CarryOverUsages;
		intent?: unknown;
		requestedBillingCycleAnchor?: unknown;
	} | null;
	return (
		(context?.intent === UpdateSubscriptionIntent.UpdatePlan ||
			(context?.intent === UpdateSubscriptionIntent.UpdateQuantity &&
				context.requestedBillingCycleAnchor === "now")) &&
		context.carryOverUsages?.enabled === false
	);
};
