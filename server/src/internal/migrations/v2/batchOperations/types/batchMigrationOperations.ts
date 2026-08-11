import type { EntitlementPrice, EntitlementWithFeature } from "@autumn/shared";
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

/** Fans a customized license link's entitlement out to that link's live
 * assignments. The entitlement row is minted once by prepare and shared. */
export type BatchMigrationAddLicenseEntitlementOp = {
	type: "add_license_entitlement";
	licensePlanId: string;
	planLicenseId: string;
	licenseInternalProductId: string;
	isOneOff: boolean;
	entitlement: EntitlementWithFeature;
	initialState: CustomerEntitlementInitialState;
	/** Set when the minted entitlement replaces one the assignments already
	 * hold, so they are repointed and rebalanced instead of gaining a row. */
	supersedes?: { entitlementId: string };
};

export type BatchMigrationOperations = {
	entitlements: BatchMigrationEntitlementOp[];
	licenseEntitlements: BatchMigrationAddLicenseEntitlementOp[];
};
