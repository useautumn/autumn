import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import type { BatchMigrationRejection } from "../../types/index.js";

/**
 * planFilterMatchesProduct (the JS matcher used to resolve op targets)
 * throws on nested price/item filters — surface that as a rejection before
 * matching instead of an exception.
 */
const planFilterHasUnsupportedFields = (filter: PlanFilter): boolean => {
	if (filter.price !== undefined || filter.item !== undefined) return true;
	return (
		filter.$or?.some((subFilter) =>
			planFilterHasUnsupportedFields(subFilter),
		) ?? false
	);
};

/**
 * Scalar guards on a single update_plan op. Everything rejected here is
 * either per-customer-variable (quantity strategies), billing-affecting
 * (proration, base price, priced items), or deprecated — i.e. provably not
 * a uniform free-entitlement mutation.
 */
export const checkUpdatePlanOpEligibility = ({
	op,
	opIndex,
}: {
	op: UpdatePlanOp;
	opIndex: number;
}): BatchMigrationRejection[] => {
	const rejections: BatchMigrationRejection[] = [];

	if (op.version !== undefined) {
		rejections.push({
			code: "version_update",
			opIndex,
			message:
				"update_plan version bumps are wholesale product transitions; only customize add_items are batch-lowered.",
		});
	}

	if (op.proration === true) {
		rejections.push({
			code: "proration_enabled",
			opIndex,
			message:
				"update_plan with proration produces real charges; the batch lane is charge-free.",
		});
	}

	if ((op.feature_quantities_strategy?.length ?? 0) > 0) {
		rejections.push({
			code: "feature_quantity_strategy",
			opIndex,
			message:
				"feature_quantities_strategy resolves a per-customer quantity; the outcome is not uniform.",
		});
	}

	if ((op.customize?.update_items?.length ?? 0) > 0) {
		rejections.push({
			code: "deprecated_update_items",
			opIndex,
			message:
				"customize.update_items is deprecated and has no batch lowering; use remove_items + add_items.",
		});
	}

	if ((op.customize?.remove_items?.length ?? 0) > 0) {
		rejections.push({
			code: "unsupported_remove_items",
			opIndex,
			message:
				"customize.remove_items is not batch-lowered yet; the batch lane is add_items-only.",
		});
	}

	if (op.customize?.price !== undefined) {
		rejections.push({
			code: "base_price_customize",
			opIndex,
			message:
				"customize.price changes the base price; base price transitions are not batch-lowered yet.",
		});
	}

	op.customize?.add_items?.forEach((item, itemIndex) => {
		if (item.price !== undefined) {
			rejections.push({
				code: "priced_add_item",
				opIndex,
				message:
					"add_items with a price attaches a paid item; only free entitlements are batch-lowered.",
				details: { itemIndex, featureId: item.feature_id },
			});
		}
	});

	if (planFilterHasUnsupportedFields(op.plan_filter)) {
		rejections.push({
			code: "unsupported_plan_filter",
			opIndex,
			message:
				"plan_filter.price / plan_filter.item are not supported by the catalog product matcher yet.",
		});
	}

	return rejections;
};
