import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import {
	OPERATION_SCOPE_FIELDS,
	type OperationScope,
	type OperationScopeConstraintKey,
} from "./operationScope.js";
import {
	reconcileConstraints,
	type ScalarConstraint,
} from "./utils/scalarConstraint.js";

const migrationPlanFilter = (
	migration: MigrationRuntime,
): PlanFilter | undefined => {
	const customerPlanFilter = migration.filter?.customer?.plan;
	if (!customerPlanFilter || "$some" in customerPlanFilter) return undefined;
	return customerPlanFilter as PlanFilter;
};

/** Row-decidable fields inside the MIGRATION filter's `$or` cannot reconcile
 * into the op's single AND-scope. (Op-level `$or` is fine — it expands into
 * per-disjunct patches before resolution.) */
export const orMentionsScopeField = (
	filter: PlanFilter | undefined,
): string | undefined => {
	for (const branch of filter?.$or ?? []) {
		for (const field of OPERATION_SCOPE_FIELDS) {
			if (branch[field.filterKey] !== undefined) return field.filterKey;
		}
		const nested = orMentionsScopeField(branch);
		if (nested) return nested;
	}
	return undefined;
};

export type ResolveOperationScopeResult =
	| { scope: OperationScope; unsupportedField?: undefined }
	| { scope?: undefined; unsupportedField: string };

/**
 * Lowers the row-level part of the plan filters (one disjunct's conjuncts +
 * the migration filter, all reconciled) into the scope a patch executes
 * against. Field-agnostic: driven entirely by OPERATION_SCOPE_FIELDS.
 */
export const resolveOperationScope = ({
	migration,
	planFilters,
	internalProductId,
}: {
	migration: MigrationRuntime;
	/** The disjunct's $or-free conjunct filters, ANDed together. */
	planFilters: PlanFilter[];
	internalProductId: string;
}): ResolveOperationScopeResult => {
	const fromMigrationFilter = migrationPlanFilter(migration);

	const orField = orMentionsScopeField(fromMigrationFilter);
	if (orField) return { unsupportedField: orField };

	const constraints: Record<OperationScopeConstraintKey, boolean | null> = {
		isCustom: null,
		isPaid: null,
		isRecurring: null,
		hasBasePrice: null,
	};

	for (const field of OPERATION_SCOPE_FIELDS) {
		let resolved: ScalarConstraint = field.lower(
			fromMigrationFilter?.[field.filterKey],
		);
		for (const planFilter of planFilters) {
			resolved = reconcileConstraints(
				resolved,
				field.lower(planFilter[field.filterKey]),
			);
		}
		if (resolved === "unsupported")
			return { unsupportedField: field.filterKey };
		constraints[field.scopeKey] = resolved;
	}

	return { scope: { internalProductId, ...constraints } };
};
