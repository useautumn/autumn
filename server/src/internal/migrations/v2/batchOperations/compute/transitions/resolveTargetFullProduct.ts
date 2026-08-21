import type {
	Entitlement,
	EntitlementWithFeature,
	Feature,
	FullProduct,
	PlanItemFilter,
} from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { entIntvToResetIntv } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/planItemIntervals.js";
import { isFixedPrice } from "@shared/utils/productUtils/priceUtils/classifyPriceUtils";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import type { BatchMigrationRejection } from "../../types/index.js";
import { resolvePreparedAddItemEntitlements } from "../utils/resolvePreparedAddItemEntitlements.js";

/** A filter speaks ResetInterval ("one_off"), an entitlement speaks
 * EntInterval ("lifetime"); both sides normalize before comparing. */
const matchesRemoveFilter = ({
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
	if (
		filter.included !== undefined &&
		entitlement.allowance !== filter.included
	) {
		return false;
	}
	return true;
};

/** Version alone is a full transition to the target; with item customize,
 * items and base-price semantics evolve from fromProduct (version is a repoint). */
export const resolveTargetFullProduct = ({
	migration,
	op,
	opIndex,
	fromProduct,
	targetProduct,
	features,
}: {
	migration: MigrationRuntime;
	op: UpdatePlanOp;
	opIndex: number;
	fromProduct: FullProduct;
	targetProduct: FullProduct;
	features: Feature[];
}): {
	toProduct?: FullProduct;
	addEntitlements: EntitlementWithFeature[];
	hasItemChanges: boolean;
	rejections: BatchMigrationRejection[];
} => {
	// Prepared add rows are minted against the target product — the product
	// the repointed row will claim.
	const { entitlements: addEntitlements, rejections } =
		resolvePreparedAddItemEntitlements({
			migration,
			op,
			opIndex,
			fromProduct: targetProduct,
			features,
		});
	if (rejections.length > 0)
		return { addEntitlements: [], hasItemChanges: false, rejections };

	const removeFilters = op.customize?.remove_items ?? [];
	const hasItemCustomize =
		(op.customize?.add_items?.length ?? 0) > 0 || removeFilters.length > 0;
	const itemBase = hasItemCustomize ? fromProduct : targetProduct;

	const removedEntitlementIds = new Set(
		itemBase.entitlements
			.filter((entitlement) =>
				removeFilters.some((filter) =>
					matchesRemoveFilter({ entitlement, filter }),
				),
			)
			.map((entitlement) => entitlement.id),
	);
	const isRemoved = (entitlementId: string | null | undefined) =>
		entitlementId ? removedEntitlementIds.has(entitlementId) : false;

	const retainedEntitlements = itemBase.entitlements.filter(
		(entitlement) => !isRemoved(entitlement.id),
	);

	return {
		toProduct: {
			...targetProduct,
			// Written add_items stay on toProduct even when catalog already has the same shape; execution dedupes.
			entitlements: [...retainedEntitlements, ...addEntitlements],
			prices: [
				...itemBase.prices.filter(isFixedPrice),
				...itemBase.prices.filter(
					(price) => !isFixedPrice(price) && !isRemoved(price.entitlement_id),
				),
			],
		},
		addEntitlements,
		hasItemChanges:
			addEntitlements.length > 0 || removedEntitlementIds.size > 0,
		rejections: [],
	};
};
