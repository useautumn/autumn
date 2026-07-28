import type { EntitlementPrice } from "@autumn/shared";
import type { computeCustomerEntitlementInitialState } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch.js";

export type CustomerEntitlementInitialState = ReturnType<
	typeof computeCustomerEntitlementInitialState
>;

/** Pure initial state instead of an initialized row template: cycle fields
 * can't be precomputed across anchors. Add dedup is the executor's job. */
export type BatchMigrationAddEntitlementOp = {
	type: "add";
	entitlementPrice: EntitlementPrice;
	initialState: CustomerEntitlementInitialState;
};

export type BatchMigrationEntitlementOp = BatchMigrationAddEntitlementOp;

export type BatchMigrationOperations = {
	entitlements: BatchMigrationEntitlementOp[];
};
