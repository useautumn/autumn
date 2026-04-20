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

	// Always fetch both Active and PastDue cusEnts, then filter PastDue ones
	// per-cusEnt based on the plan-level ignore_past_due flag on the product.
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer: fullCus,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});

	for (const cusEnt of cusEnts) {
		if (!cusEnt.next_reset_at || cusEnt.next_reset_at >= now) continue;

		// Skip past_due cusEnts unless the product opts into ignore_past_due.
		// cusEnts with no customer_product (legacy / uncategorized) fall
		// through this check and are still eligible for reset.
		const cusProduct = cusEnt.customer_product;
		if (cusProduct?.status === CusProductStatus.PastDue) {
			const product = cusProduct.product;
			if (!product?.config?.ignore_past_due) continue;
		}

		const cusPrice = cusEntToCusPrice({ cusEnt });
		if (cusPrice) continue;

		result.push({
			...cusEnt,
			customer_product: cusEnt.customer_product,
		});
	}

	return result;
};
