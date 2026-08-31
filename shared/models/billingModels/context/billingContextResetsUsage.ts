import type { CarryOverUsages } from "../../../api/billing/common/carryOverUsages";
import { UpdateSubscriptionIntent } from "./updateSubscriptionBillingContext";

/** Whether this transition clears the customer's usage balances. The executor
 * resets them on exactly this condition, so the preview asks the same question
 * rather than inferring one of its own. */
export const billingContextResetsUsage = (billingContext: unknown): boolean => {
	const context = billingContext as {
		carryOverUsages?: CarryOverUsages;
		intent?: unknown;
		requestedBillingCycleAnchor?: number | "now";
	} | null;
	if (!context || context.carryOverUsages?.enabled === true) return false;

	const restartsBillingCycle = context.requestedBillingCycleAnchor === "now";
	const replacesPlan =
		context.intent === UpdateSubscriptionIntent.UpdatePlan &&
		context.carryOverUsages?.enabled === false;

	return restartsBillingCycle || replacesPlan;
};
