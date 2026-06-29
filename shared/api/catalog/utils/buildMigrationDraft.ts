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

export interface CombinedVariantMigrationTarget {
	id: string;
	version: number;
}

export interface AllVersionsUpdateMigrationTarget {
	id: string;
	customize: DiffedCustomizePlanV1 | null;
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

/** Build a draft that moves customers on `planId` from `from` to `to`.
 * Creating a draft does not run it. */
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

export const buildCombinedVariantMigrationDraft = ({
	targets,
	hasBillingChanges,
	includeCustom = false,
}: {
	targets: CombinedVariantMigrationTarget[];
	hasBillingChanges: boolean;
	includeCustom?: boolean;
}): MigrationDraft | null => {
	if (targets.length === 0) return null;

	const planIds = targets.map((target) => target.id);

	const idsByVersion = new Map<number, string[]>();
	for (const target of targets) {
		const ids = idsByVersion.get(target.version) ?? [];
		ids.push(target.id);
		idsByVersion.set(target.version, ids);
	}
	const versionGroups = Array.from(idsByVersion.entries());

	const planMatcher = (ids: string[]) =>
		ids.length === 1 ? ids[0] : { $in: ids };

	const versionOps = (custom: boolean): UpdatePlanOp[] =>
		versionGroups.map(([version, ids]) => ({
			type: "update_plan",
			plan_filter: { plan_id: planMatcher(ids), version, custom },
			version,
		}));

	// Scope candidate selection to each target's edited version so the count
	// and run never reach across versions. Base and variants can sit at
	// different versions, so OR the per-version branches.
	const planFilters = versionGroups.map(([version, ids]) => ({
		plan_id: planMatcher(ids),
		version,
		...(includeCustom ? {} : { custom: false }),
	}));
	const customerFilter: MigrationFilter["customer"] =
		planFilters.length === 1
			? { plan: planFilters[0] }
			: { $or: planFilters.map((plan) => ({ plan })) };

	return {
		id: `plan-migrate-${planIds.length}-${migrationUid()}`,
		filter: { customer: customerFilter },
		operations: {
			customer: includeCustom
				? [...versionOps(false), ...versionOps(true)]
				: versionOps(false),
		},
		no_billing_changes: !hasBillingChanges,
	};
};

export const buildAllVersionsUpdateMigrationDraft = ({
	targets,
	hasBillingChanges,
	includeCustom = false,
}: {
	targets: AllVersionsUpdateMigrationTarget[];
	hasBillingChanges: boolean;
	includeCustom?: boolean;
}): MigrationDraft | null => {
	// Group plans sharing an identical customize so the same edit becomes one op.
	const groups = new Map<
		string,
		{ customize: DiffedCustomizePlanV1; ids: string[] }
	>();
	for (const target of targets) {
		if (!target.customize) continue;
		const customize = migratablePlanDiff(target.customize);
		if (Object.keys(customize).length === 0) continue;

		const key = JSON.stringify(customize);
		const group = groups.get(key);
		if (group) {
			if (!group.ids.includes(target.id)) group.ids.push(target.id);
		} else {
			groups.set(key, { customize, ids: [target.id] });
		}
	}

	const ops = Array.from(groups.values()).flatMap(
		({ customize, ids }): UpdatePlanOp[] => {
			const planMatcher = ids.length === 1 ? ids[0] : { $in: ids };
			const op = (custom: boolean): UpdatePlanOp => ({
				type: "update_plan",
				plan_filter: { plan_id: planMatcher, custom },
				customize,
			});

			return includeCustom ? [op(false), op(true)] : [op(false)];
		},
	);
	if (ops.length === 0) return null;

	const planIds = [...new Set(targets.map((target) => target.id))];
	const planMatcher = planIds.length === 1 ? planIds[0] : { $in: planIds };
	const basePlanFilter = { plan_id: planMatcher };

	return {
		id: `plan-update-all-${planIds.length}-${migrationUid()}`,
		filter: {
			customer: {
				plan: includeCustom
					? basePlanFilter
					: { ...basePlanFilter, custom: false },
			},
		},
		operations: { customer: ops },
		no_billing_changes: !hasBillingChanges,
	};
};
