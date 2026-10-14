import {
	CusProductStatus,
	cusEntToCusPrice,
	type FullCusEntWithFullCusProduct,
	isCustomerEntitlementPrepaidWithSeparateResetInterval,
	isPooledBalanceSourceCustomerEntitlement,
	isSyntheticPooledBalanceCustomerEntitlement,
	PooledBalanceResetMode,
} from "@autumn/shared";

export const getResettableCustomerEntitlements = ({
	customerEntitlements,
	now,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	now: number;
}): FullCusEntWithFullCusProduct[] => {
	const result: FullCusEntWithFullCusProduct[] = [];

	for (const cusEnt of customerEntitlements) {
		if (!cusEnt.next_reset_at || cusEnt.next_reset_at >= now) continue;
		if (
			isPooledBalanceSourceCustomerEntitlement({
				customerEntitlement: cusEnt,
			})
		) {
			continue;
		}
		if (
			isSyntheticPooledBalanceCustomerEntitlement({
				customerEntitlement: cusEnt,
			}) &&
			cusEnt.pooled_balance?.reset_mode === PooledBalanceResetMode.Lifetime
		) {
			continue;
		}

		const cusProduct = cusEnt.customer_product;
		if (cusProduct?.status === CusProductStatus.PastDue) {
			if (!cusProduct.product?.config?.ignore_past_due) continue;
		}

		const cusPrice = cusEntToCusPrice({ cusEnt });
		if (
			cusPrice &&
			!isCustomerEntitlementPrepaidWithSeparateResetInterval({
				customerEntitlement: cusEnt,
				customerPrice: cusPrice,
			})
		) {
			continue;
		}

		result.push(cusEnt);
	}

	return result;
};
