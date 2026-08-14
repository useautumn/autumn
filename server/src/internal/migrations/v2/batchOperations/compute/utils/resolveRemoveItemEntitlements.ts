import type { Entitlement, FullProduct, PlanItemFilter } from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { entIntvToResetIntv } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/planItemIntervals.js";

/** A filter speaks ResetInterval ("one_off"), an entitlement speaks
 * EntInterval ("lifetime"); both sides normalize before comparing. */
const matchesFilter = ({
	entitlement,
	filter,
}: {
	entitlement: Entitlement;
	filter: PlanItemFilter;
}) => {
	if (filter.feature_id !== entitlement.feature_id) return false;
	if (
		filter.interval !== undefined &&
		entIntvToResetIntv({ entInterval: entitlement.interval }) !==
			String(filter.interval)
	) {
		return false;
	}
	if (
		filter.interval_count !== undefined &&
		(entitlement.interval_count ?? 1) !== filter.interval_count
	) {
		return false;
	}
	return true;
};

/** Modify-in-place pairs never reach here — checkUpdatePlanOpEligibility
 * rejects them, so every filter is a standalone deletion. */
export const resolveRemoveItemEntitlements = ({
	op,
	fromProduct,
}: {
	op: UpdatePlanOp;
	fromProduct: FullProduct;
}): string[] => {
	const filters = op.customize?.remove_items ?? [];
	if (filters.length === 0) return [];

	return fromProduct.entitlements
		.filter((entitlement) =>
			filters.some((filter) => matchesFilter({ entitlement, filter })),
		)
		.map((entitlement) => entitlement.id);
};
