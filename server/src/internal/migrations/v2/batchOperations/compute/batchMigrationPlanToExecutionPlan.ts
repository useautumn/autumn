import type {
	BatchMigrationExecutionPlan,
	BatchMigrationPlan,
} from "../types/index.js";

/** Lowers the computed plan to the serializable form chunk tasks execute —
 * the from-product rides along (licenses stripped) so execution and finalize
 * derive ids and price facts with the shared product utils. */
export const batchMigrationPlanToExecutionPlan = ({
	plan,
}: {
	plan: BatchMigrationPlan;
}): BatchMigrationExecutionPlan => ({
	patches: plan.patches.map((patch) => {
		const { licenses: _licenses, ...fromProduct } = patch.fromProduct;
		return {
			opIndex: patch.opIndex,
			scope: patch.scope,
			fromProduct,
			addEntitlementOps: patch.operations.entitlements.map((operation) => ({
				entitlement: operation.entitlementPrice.entitlement,
				initialState: operation.initialState,
			})),
			addLicenseEntitlementOps: patch.operations.licenseEntitlements.map(
				(operation) => ({
					licensePlanId: operation.licensePlanId,
					planLicenseId: operation.planLicenseId,
					licenseInternalProductId: operation.licenseInternalProductId,
					isOneOff: operation.isOneOff,
					entitlement: operation.entitlement,
					initialState: operation.initialState,
					carryFromEntitlementId: operation.carryFromEntitlementId,
				}),
			),
		};
	}),
});
