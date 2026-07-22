import {
	CusProductStatus,
	cusEntToCusPrice,
	type FullCusEntWithFullCusProduct,
	isCustomerEntitlementPrepaidWithSeparateResetInterval,
	isPooledBalanceSourceCustomerEntitlement,
	isSyntheticPooledBalanceCustomerEntitlement,
	PooledBalanceResetMode,
} from "@autumn/shared";

/**
 * Filters customer entitlements to those needing reset:
 *   - `next_reset_at` is set and overdue (`< now`)
 *   - not price-backed (metered paid entitlements are billed, not reset)
 *   - past-due cusEnts are skipped unless the owning product opts in via
 *     `product.config.ignore_past_due === true`
 *
 * Callers must fetch `[Active, PastDue]` cusEnts upstream for the past-due
 * gate to apply; narrower fetches are still correct (past-due cusEnts simply
 * never enter the candidate set).
 */
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
			cusEnt.pooled_balance?.reset_mode !== PooledBalanceResetMode.Lazy
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
