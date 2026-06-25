import type { MigrationFilter } from "@api/migrations/filters/migrationFilter.js";
import type { UpdatePlanOp } from "@api/migrations/operations/customer/updatePlan/updatePlanOp.js";
import type { Operations } from "@api/migrations/operations/operations.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import {
	type DiffedCustomizePlanV1,
	diffPlanV1,
} from "@utils/planV1Utils/diff/diffPlanV1.js";
import { migrationUid } from "./migrationUid.js";

export type MigrationScope = "this_version" | "all_customers";

export interface MigrationDraft {
	id: string;
	filter: MigrationFilter;
	operations: Operations;
	no_billing_changes: boolean;
}

/** True when the diff changes what a customer is billed (price or any priced item). */
export const planDiffHasBillingChanges = (
	diff: DiffedCustomizePlanV1,
	from: ApiPlanV1,
): boolean => {
	if (diff.price !== undefined) return true;
	if (diff.add_items?.some((item) => item.price != null)) return true;
	// Remove filters can omit billing_method even when priced, so check the
	// source items by feature_id rather than the lossy filter.
	const removedFeatureIds = new Set(
		diff.remove_items?.map((item) => item.feature_id) ?? [],
	);
	return (
		from.items?.some(
			(item) => item.price != null && removedFeatureIds.has(item.feature_id),
		) ?? false
	);
};

const migratablePlanDiff = (
	diff: DiffedCustomizePlanV1,
): DiffedCustomizePlanV1 => ({
	...(diff.price !== undefined ? { price: diff.price } : {}),
	...(diff.add_items !== undefined ? { add_items: diff.add_items } : {}),
	...(diff.remove_items !== undefined
		? { remove_items: diff.remove_items }
		: {}),
	...(diff.update_items !== undefined
		? { update_items: diff.update_items }
		: {}),
});

/**
 * Build a migration draft that moves customers on `planId` from the `from` plan
 * shape to the `to` shape. Creating a draft does NOT run it — running is a
 * separate explicit step. Pure: callers convert their product to ApiPlanV1
 * (via productV2ToApiPlanV1) before calling.
 */
export const buildMigrationDraft = ({
	from,
	to,
	planId,
	version,
	scope,
	includeCustom = false,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
	planId: string;
	version?: number;
	scope: MigrationScope;
	includeCustom?: boolean;
}): MigrationDraft => {
	const diff = migratablePlanDiff(diffPlanV1({ from, to }));
	const customize = Object.keys(diff).length > 0 ? diff : undefined;

	const basePlanFilter = {
		plan_id: planId,
		...(scope === "this_version" && version !== undefined ? { version } : {}),
	};
	const planFilter = includeCustom
		? basePlanFilter
		: { ...basePlanFilter, custom: false };

	const updatePlanOp: UpdatePlanOp = {
		type: "update_plan",
		plan_filter: basePlanFilter,
		...(customize ? { customize } : {}),
	};

	const filter: MigrationFilter = { customer: { plan: planFilter } };
	const suffix = scope === "all_customers" ? "update-all" : "update";

	return {
		id: `${planId}-${suffix}-${migrationUid()}`,
		filter,
		operations: { customer: [updatePlanOp] },
		no_billing_changes: !planDiffHasBillingChanges(diff, from),
	};
};
