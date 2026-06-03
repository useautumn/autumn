import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import { hasVersionBumpUpdatePlan } from "./hasVersionBumpUpdatePlan.js";

type PlanQuantifier = {
	$some?: PlanFilter;
	$every?: PlanFilter;
	$none?: PlanFilter;
};

const injectCustomFalse = (planFilter: PlanFilter): PlanFilter =>
	planFilter.custom !== undefined
		? planFilter
		: { ...planFilter, custom: false };

const isQuantifierObject = (
	value: PlanFilter | PlanQuantifier,
): value is PlanQuantifier =>
	typeof value === "object" &&
	value !== null &&
	("$some" in value || "$every" in value || "$none" in value);

/**
 * Filter-level guard. Pushes `custom: false` down into the customer-scope
 * plan filter whenever any update_plan op bumps `version`, so the SQL
 * query that pulls candidate customers never even fetches admin-customized
 * cusProducts. Same opt-out as the op-level hook: if the caller already
 * specified a `custom` predicate, leave it alone.
 */
export const preProcessMigrationFilter = ({
	operations,
	filter,
}: {
	operations: Operations | null | undefined;
	filter: MigrationFilter | null | undefined;
}): MigrationFilter | null | undefined => {
	if (!filter) return filter;
	if (!hasVersionBumpUpdatePlan(operations)) return filter;
	if (!filter.customer) return filter;

	const planRule = filter.customer.plan;
	if (planRule === undefined) return filter;

	const nextPlan: PlanFilter | PlanQuantifier = isQuantifierObject(planRule)
		? {
				...planRule,
				...(planRule.$some
					? { $some: injectCustomFalse(planRule.$some) }
					: {}),
				...(planRule.$every
					? { $every: injectCustomFalse(planRule.$every) }
					: {}),
			}
		: injectCustomFalse(planRule);

	return {
		...filter,
		customer: { ...filter.customer, plan: nextPlan },
	};
};
