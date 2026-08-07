import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import type { BatchMigrationRejection } from "../../types/index.js";

/** `item` navigation has no batch lowering at any depth; top-level `price`
 * lowers into the scope, but the catalog matcher throws on it inside $or. */
const planFilterHasItem = (filter: PlanFilter): boolean => {
	if (filter.item !== undefined) return true;
	return filter.$or?.some((subFilter) => planFilterHasItem(subFilter)) ?? false;
};

/** Only a pure free `add_items` customize lowers into the assignment fan-out —
 * everything else is per-customer definition work. */
const checkUpsertLicensesEligibility = ({
	op,
	opIndex,
}: {
	op: UpdatePlanOp;
	opIndex: number;
}): BatchMigrationRejection[] =>
	(op.customize?.upsert_licenses ?? []).flatMap(
		(entry): BatchMigrationRejection[] => {
			const customize = entry.customize;
			const details = { licensePlanId: entry.license_plan_id };

			if ((customize?.add_items?.length ?? 0) === 0) {
				return [
					{
						code: "unsupported_upsert_licenses" as const,
						opIndex,
						message:
							"upsert_licenses without add_items resets the link to catalog inheritance; only the per-customer lane applies it.",
						details,
					},
				];
			}

			const changesLinkFields =
				entry.included !== undefined ||
				entry.prepaid_only !== undefined ||
				entry.metadata !== undefined;
			const changesBeyondAddItems =
				customize?.price !== undefined ||
				(customize?.remove_items?.length ?? 0) > 0;
			if (changesLinkFields || changesBeyondAddItems) {
				return [
					{
						code: "unsupported_upsert_licenses" as const,
						opIndex,
						message:
							"customize.upsert_licenses link fields, base price, and remove_items are per-customer definition work.",
						details,
					},
				];
			}

			return (customize?.add_items ?? [])
				.filter((item) => item.price !== undefined)
				.map((item) => ({
					code: "priced_add_item" as const,
					opIndex,
					message:
						"upsert_licenses add_items with a price attaches a paid item; only free entitlements are batch-lowered.",
					details: { ...details, featureId: item.feature_id },
				}));
		},
	);

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

	rejections.push(...checkUpsertLicensesEligibility({ op, opIndex }));

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

	if (planFilterHasItem(op.plan_filter)) {
		rejections.push({
			code: "unsupported_plan_filter",
			opIndex,
			message: "plan_filter.item is not batch-lowered.",
		});
	}

	return rejections;
};
