import type {
	BatchMigrationExecutionPlan,
	BatchMigrationPlan,
} from "../types/index.js";

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
					...(operation.kind === "remove"
						? { kind: operation.kind, filter: operation.filter }
						: {
								entitlement: operation.entitlement,
								initialState: operation.initialState,
								...(operation.kind === "add"
									? { kind: operation.kind }
									: {
											kind: operation.kind,
											fromEntitlementId: operation.fromEntitlementId,
										}),
							}),
				}),
			),
		};
	}),
});
