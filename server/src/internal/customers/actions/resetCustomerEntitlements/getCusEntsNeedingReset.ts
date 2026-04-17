import {
	CusProductStatus,
	cusEntToCusPrice,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
} from "@autumn/shared";

/** Collects cusEnts from a FullCustomer that need resetting (next_reset_at < now). */
export const getCusEntsNeedingReset = ({
	fullCus,
	now,
}: {
	fullCus: FullCustomer;
	now: number;
}): FullCusEntWithFullCusProduct[] => {
	const result: FullCusEntWithFullCusProduct[] = [];

	// If the customer opted into ignore_past_due, also reset entitlements
	// for products that are currently past_due.
	const inStatuses = fullCus.ignore_past_due
		? [CusProductStatus.Active, CusProductStatus.PastDue]
		: [CusProductStatus.Active];

	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer: fullCus,
		inStatuses,
	});

	for (const cusEnt of cusEnts) {
		if (!cusEnt.next_reset_at || cusEnt.next_reset_at >= now) continue;

		const cusPrice = cusEntToCusPrice({ cusEnt });
		if (cusPrice) continue;

		result.push({
			...cusEnt,
			customer_product: cusEnt.customer_product,
		});
	}

	return result;
};
