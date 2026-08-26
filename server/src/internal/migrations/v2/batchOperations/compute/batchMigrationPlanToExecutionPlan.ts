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
			removeEntitlementOps: patch.operations.removeEntitlements
				.filter((operation) => operation.by === "filter")
				.map((operation) => ({
					by: "filter" as const,
					from: operation.from,
				})),
			replaceEntitlementOps: patch.operations.replaceEntitlements
				.filter((operation) => operation.by === "filter")
				.map((operation) => ({
					by: "filter" as const,
					from: operation.from,
					entitlement: operation.entitlementPrice.entitlement,
					initialState: operation.initialState,
				})),
			licenseEntitlementOps: patch.operations.licenseEntitlements,
			repointCustomerProduct: patch.operations.repointCustomerProduct,
		};
	}),
});
