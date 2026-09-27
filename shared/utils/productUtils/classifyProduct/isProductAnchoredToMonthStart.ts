import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { EntInterval } from "@models/productModels/intervals/entitlementInterval";
import type { FullProduct } from "@models/productModels/productModels";
import { getSmallestInterval } from "@utils/intervalUtils/priceIntervalUtils";
import { isOneOffProduct } from "@utils/productUtils/classifyProduct/classifyProductUtils";

const MONTHLY_OR_LONGER_RESET_INTERVALS: ReadonlySet<EntInterval> = new Set([
	EntInterval.Month,
	EntInterval.Quarter,
	EntInterval.SemiAnnual,
	EntInterval.Year,
]);

/**
 * The flag needs a monthly-or-longer cycle to anchor: the billing interval when the
 * plan is paid, otherwise a reset interval. Weekly cycles keep their own day.
 */
export const isProductAnchoredToMonthStart = ({
	product,
}: {
	product: FullProduct;
}) => {
	if (product.config?.anchor_to_month_start !== true) return false;
	if (isOneOffProduct({ product })) return false;

	const smallestInterval = getSmallestInterval({
		prices: product.prices,
		excludeOneOff: true,
	});
	if (smallestInterval) {
		return smallestInterval.interval !== BillingInterval.Week;
	}

	return product.entitlements.some(
		(entitlement) =>
			entitlement.interval != null &&
			MONTHLY_OR_LONGER_RESET_INTERVALS.has(entitlement.interval),
	);
};
