import type { AutumnBillingPlan, LineItem } from "@autumn/shared";

/** Lines of a plan the request replaces that no Stripe subscription billed, such as its accrued usage. */
export const lineItemsNoSubscriptionBilled = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): LineItem[] => {
	const insertedCustomerProductIds = new Set(
		autumnBillingPlan.insertCustomerProducts.map(({ id }) => id),
	);
	return (autumnBillingPlan.lineItems ?? []).filter(({ context }) => {
		const { customerProduct } = context;
		if (!customerProduct) return false;
		return (
			!insertedCustomerProductIds.has(customerProduct.id) &&
			!customerProduct.subscription_ids?.length
		);
	});
};
