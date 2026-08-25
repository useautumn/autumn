import type { CarryOverUsages } from "../../../api/billing/common/carryOverUsages";
import { UpdateSubscriptionIntent } from "./updateSubscriptionBillingContext";

/** Whether this transition clears the customer's usage balances. The executor
 * resets them on exactly this condition, so the preview asks the same question
 * rather than inferring one of its own. */
export const billingContextResetsUsage = (billingContext: unknown): boolean => {
	const context = billingContext as {
		carryOverUsages?: CarryOverUsages;
		intent?: unknown;
	} | null;
	return (
		context?.intent === UpdateSubscriptionIntent.UpdatePlan &&
		context.carryOverUsages?.enabled === false
	);
};
