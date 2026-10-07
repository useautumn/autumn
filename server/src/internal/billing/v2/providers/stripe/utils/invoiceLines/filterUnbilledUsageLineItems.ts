import type { AutumnBillingPlan, LineItem } from "@autumn/shared";
import { isUsageNoSubscriptionBilled } from "@/internal/billing/v2/compute/finalize/isUsageNoSubscriptionBilled";

/** Credits stay out: Stripe never charged a plan no subscription billed, so there is nothing to refund. */
export const filterUnbilledUsageLineItems = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): LineItem[] => {
	const insertedCustomerProductIds = new Set(
		autumnBillingPlan.insertCustomerProducts.map(({ id }) => id),
	);
	return (autumnBillingPlan.lineItems ?? []).filter((lineItem) => {
		const { customerProduct } = lineItem.context;
		if (!customerProduct || !isUsageNoSubscriptionBilled(lineItem))
			return false;
		return !insertedCustomerProductIds.has(customerProduct.id);
	});
};
