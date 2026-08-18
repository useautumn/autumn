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
			toProduct: patch.toProduct,
			addEntitlementOps: patch.operations.addEntitlements.map((operation) => ({
				entitlement: operation.entitlementPrice.entitlement,
				initialState: operation.initialState,
			})),
			removeEntitlementOps: patch.operations.removeEntitlements.map(
				(operation) => ({
					entitlement: operation.entitlementPrice.entitlement,
				}),
			),
			replaceEntitlementOps: patch.operations.replaceEntitlements.map(
				(operation) => ({
					fromEntitlement: operation.fromEntitlementPrice.entitlement,
					entitlement: operation.entitlementPrice.entitlement,
					initialState: operation.initialState,
				}),
			),
			licenseEntitlementOps: patch.operations.licenseEntitlements,
			repointCustomerProduct: patch.operations.repointCustomerProduct,
		};
	}),
});
