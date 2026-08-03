import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import type { BatchMigrationRejection } from "../../types/index.js";

export type EligibleUpdatePlanOp = {
	opIndex: number;
	op: UpdatePlanOp;
};

/**
 * Migration-level gate for batch lowering. The batch lane never evaluates
 * Stripe, so the migration must explicitly declare `no_billing_changes` —
 * inferring DB-only from the computed output would let a compute phase gap turn
 * into a silent billing skip.
 */
export const checkMigrationEligibility = ({
	migration,
}: {
	migration: MigrationRuntime;
}): {
	rejections: BatchMigrationRejection[];
	updatePlanOps: EligibleUpdatePlanOp[];
} => {
	const rejections: BatchMigrationRejection[] = [];
	const updatePlanOps: EligibleUpdatePlanOp[] = [];

	if (migration.no_billing_changes !== true) {
		rejections.push({
			code: "billing_changes_not_disabled",
			message:
				"Batch execution requires no_billing_changes to be explicitly true — the batch lane never evaluates Stripe.",
		});
	}

	const customerOperations = migration.operations?.customer ?? [];
	if (customerOperations.length === 0) {
		rejections.push({
			code: "missing_operations",
			message: "Migration has no customer operations to compute.",
		});
	}

	customerOperations.forEach((operation, opIndex) => {
		if (operation.type !== "update_plan") {
			rejections.push({
				code: "unsupported_operation_type",
				opIndex,
				message: `Operation type "${operation.type}" has no batch lowering yet.`,
			});
			return;
		}
		updatePlanOps.push({ opIndex, op: operation });
	});

	return { rejections, updatePlanOps };
};
