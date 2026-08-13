import type {
	EntitlementPrice,
	EntitlementWithFeature,
	PlanItemFilter,
} from "@autumn/shared";
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

type BatchMigrationLicenseOpTarget = {
	licensePlanId: string;
	planLicenseId: string;
	licenseInternalProductId: string;
	isOneOff: boolean;
};

/** Fans a customized link's entitlement out to that link's live assignments.
 * The entitlement row is minted once by prepare and shared. */
export type BatchMigrationAddLicenseEntitlementOp =
	BatchMigrationLicenseOpTarget & {
		type: "add_license_entitlement";
		entitlement: EntitlementWithFeature;
		initialState: CustomerEntitlementInitialState;
	};

/** Moves live rows off the definition they hold and onto the minted one,
 * carrying the balance across rather than re-granting it. */
export type BatchMigrationReplaceLicenseEntitlementOp =
	BatchMigrationLicenseOpTarget & {
		type: "replace_license_entitlement";
		fromEntitlementId: string;
		entitlement: EntitlementWithFeature;
		initialState: CustomerEntitlementInitialState;
	};

/** Drops the rows a filter matches from that link's live assignments. */
export type BatchMigrationRemoveLicenseEntitlementOp =
	BatchMigrationLicenseOpTarget & {
		type: "remove_license_entitlement";
		filter: PlanItemFilter;
	};

export type BatchMigrationLicenseEntitlementOp =
	| BatchMigrationAddLicenseEntitlementOp
	| BatchMigrationReplaceLicenseEntitlementOp
	| BatchMigrationRemoveLicenseEntitlementOp;

export type BatchMigrationOperations = {
	entitlements: BatchMigrationEntitlementOp[];
	licenseEntitlements: BatchMigrationLicenseEntitlementOp[];
};
