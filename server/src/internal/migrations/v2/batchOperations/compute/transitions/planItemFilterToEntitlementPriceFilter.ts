import type { PlanItemFilter, ResetInterval } from "@autumn/shared";
import { resetIntvToEntIntv } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/planItemIntervals.js";
import type { EntitlementPriceFilter } from "../../types/entitlementPriceFilter.js";

/** Compiles a PlanItemFilter into SQL-ready entitlement columns. The only
 * ResetInterval → EntInterval conversion on the product patch path. */
export const planItemFilterToEntitlementPriceFilter = ({
	filter,
}: {
	filter: PlanItemFilter;
}): EntitlementPriceFilter => {
	const compiled: EntitlementPriceFilter = {};

	if (filter.feature_id !== undefined) {
		compiled.feature_id = filter.feature_id;
	}
	if (filter.billing_method !== undefined) {
		compiled.billing_method = filter.billing_method;
	}
	if (filter.interval !== undefined) {
		compiled.interval = resetIntvToEntIntv({
			resetIntv: filter.interval as ResetInterval,
		});
		compiled.interval_count = filter.interval_count ?? 1;
	} else if (filter.interval_count !== undefined) {
		compiled.interval_count = filter.interval_count;
	}
	if (filter.included !== undefined) {
		compiled.included = filter.included;
	}

	return compiled;
};
