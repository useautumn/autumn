import type { BillingContext } from "@autumn/shared";
import type { BillingChangeFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

/** What the request asks of the billing cycle anchor: reset it now, a set date, or leave it. */
export const billingContextToCycleAnchorFacts = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): BillingChangeFacts["billing_cycle_anchor"] => {
	const { requestedBillingCycleAnchor } = billingContext;
	if (requestedBillingCycleAnchor === undefined) return "unchanged";
	return requestedBillingCycleAnchor === "now" ? "now" : "custom";
};
