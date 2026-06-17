import {
	customerEntitlementToBillingCycleEnd,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";

export const getEarliestCustomerBalanceBillingCycleEnd = ({
	balances,
	now,
}: {
	balances: FullCusEntWithFullCusProduct[];
	now: number;
}): number | null => {
	let earliestBillingCycleEnd: number | null = null;

	for (const balance of balances) {
		const billingCycleEnd = customerEntitlementToBillingCycleEnd({
			customerEntitlement: balance,
			now,
		});
		if (!billingCycleEnd) continue;
		if (!earliestBillingCycleEnd || billingCycleEnd < earliestBillingCycleEnd) {
			earliestBillingCycleEnd = billingCycleEnd;
		}
	}

	return earliestBillingCycleEnd;
};
