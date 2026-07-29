import type {
	BatchMigrationExecutionPlan,
	BatchMigrationPlan,
} from "../types/index.js";

/** Lowers the computed plan to the serializable form chunk tasks execute —
 * rich products stay compute-side; execution gets ids and add rows only. */
export const batchMigrationPlanToExecutionPlan = ({
	plan,
}: {
	plan: BatchMigrationPlan;
}): BatchMigrationExecutionPlan => ({
	patches: plan.patches.map((patch) => ({
		opIndex: patch.opIndex,
		planId: patch.planId,
		fromInternalProductId: patch.fromProduct.internal_id,
		addEntitlementOps: patch.operations.entitlements.map((operation) => ({
			entitlement: operation.entitlementPrice.entitlement,
			initialState: operation.initialState,
		})),
	})),
});
