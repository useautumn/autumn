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

	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer: fullCus,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
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
