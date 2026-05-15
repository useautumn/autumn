import type {
	CustomerOperation,
	CustomerOperations,
} from "@autumn/shared/api/migrations/operations/customer/customerOperations.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";

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
}: {
	operations: Operations;
}): Operations => {
	if (!operations.customer) return operations;

	const customerOps: CustomerOperations = operations.customer.map(
		(op): CustomerOperation => {
			if (op.type !== "update_plan") return op;
			if (op.version === undefined) return op;
			if (op.plan_filter.custom !== undefined) return op;

			return {
				...op,
				plan_filter: {
					...op.plan_filter,
					custom: false,
				},
			};
		},
	);

	return { ...operations, customer: customerOps };
};
