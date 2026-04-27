import {
	cusEntToCusPrice,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";

/** Filters customer entitlements to those needing reset: overdue next_reset_at, not price-backed. */
export const getResettableCustomerEntitlements = ({
	customerEntitlements,
	now,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	now: number;
}): FullCusEntWithFullCusProduct[] => {
	const result: FullCusEntWithFullCusProduct[] = [];

	for (const customerEntitlement of customerEntitlements) {
		if (
			!customerEntitlement.next_reset_at ||
			customerEntitlement.next_reset_at >= now
		)
			continue;

		const customerPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
		if (customerPrice) continue;

		result.push(customerEntitlement);
	}

	return result;
};
