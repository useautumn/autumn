import { BillingInterval } from "../../../models/productModels/intervals/billingInterval";
import { EntInterval } from "../../../models/productModels/intervals/entitlementInterval";
import { ProductItemInterval } from "../../../models/productModels/intervals/productItemInterval";

type IntervalType = BillingInterval | EntInterval | ProductItemInterval;

export const formatInterval = ({
	interval,
	intervalCount = 1,
	prefix = "per ",
}: {
	interval?: IntervalType;
	intervalCount?: number;
	prefix?: string;
}): string => {
	if (!interval) return "";

	// Handle one_off and lifetime (no interval string)
	if (
		interval === BillingInterval.OneOff ||
		interval === EntInterval.Lifetime
	) {
		return "";
	}

	let intervalStr: string = interval;

	// Handle special case for semi_annual
	if (
		interval === BillingInterval.SemiAnnual ||
		interval === EntInterval.SemiAnnual ||
		interval === ProductItemInterval.SemiAnnual
	) {
		intervalStr = "half year";
	}

	if (intervalCount === 1) {
		return `${prefix}${intervalStr}`;
	}

	return `${prefix}${intervalCount} ${intervalStr}s`;
};
