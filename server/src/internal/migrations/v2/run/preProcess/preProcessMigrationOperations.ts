import type {
	CustomerOperation,
	CustomerOperations,
} from "@autumn/shared/api/migrations/operations/customer/customerOperations.js";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";

type PlanQuantifier = {
	$some?: PlanFilter;
	$every?: PlanFilter;
	$none?: PlanFilter;
};

const isPlanQuantifier = (
	plan: PlanFilter | PlanQuantifier,
): plan is PlanQuantifier =>
	"$some" in plan || "$every" in plan || "$none" in plan;

const planFilterTargetsCustom = (plan: PlanFilter): boolean =>
	plan.custom === true || (plan.$or ?? []).some(planFilterTargetsCustom);

const planTargetsCustom = (plan: PlanFilter | PlanQuantifier): boolean => {
	if (isPlanQuantifier(plan)) {
		return [plan.$some, plan.$every, plan.$none].some((inner) => {
			if (inner === undefined) return false;
			return planFilterTargetsCustom(inner);
		});
	}

	return planFilterTargetsCustom(plan);
};

const filterTargetsCustom = (filter: MigrationFilter | null | undefined) => {
	const customer = filter?.customer;
	if (customer?.customer_id) return true;
	if (customer?.plan === undefined) return false;
	return planTargetsCustom(customer.plan);
};

/**
 * Op-level guard. Any `update_plan` op that bumps `version` automatically
 * gets `plan_filter.custom: false` so admin-customized customer_products
 * are never silently migrated. Explicit `plan_filter.custom` on the op
 * overrides the default — callers opting into migrating custom plans
 * have to say so.
 *
 * Pure transform: returns a new `Operations` object, never mutates input.
 */
export const preProcessMigrationOperations = ({
	operations,
	filter,
}: {
	operations: Operations;
	filter?: MigrationFilter | null;
}): Operations => {
	if (operations.customer === undefined) return operations;

	const targetsCustom = filterTargetsCustom(filter);

	const customerOps: CustomerOperations = operations.customer.map(
		(op): CustomerOperation => {
			if (op.type === "update_plan") {
				if (op.version === undefined) return op;
				if (
					op.plan_filter.custom === true ||
					op.plan_filter.custom === false
				) {
					return op;
				}
				if (targetsCustom) return op;

				return {
					...op,
					plan_filter: {
						...op.plan_filter,
						custom: false,
					},
				};
			}

			return op;
		},
	);

	return { ...operations, customer: customerOps };
};
