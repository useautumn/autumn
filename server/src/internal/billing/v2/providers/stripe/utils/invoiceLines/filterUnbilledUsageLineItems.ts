import type { AutumnBillingPlan, LineItem } from "@autumn/shared";
import { isUsageNoSubscriptionBilled } from "@/internal/billing/v2/compute/finalize/isUsageNoSubscriptionBilled";

/**
 * Accrued usage of a replaced plan no Stripe subscription billed, which no subscription invoice carries.
 * Its unused-time credits stay out: Stripe never charged that plan, so there is nothing to refund.
 */
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
