import type {
	EntitlementPrice,
	EntitlementWithFeature,
	PlanItemFilter,
} from "@autumn/shared";
import type { computeCustomerEntitlementInitialState } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch.js";
import type { CustomerProductTransition } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeCustomerProductTransition.js";
import type { EntitlementPriceFilter } from "./entitlementPriceFilter.js";

export type CustomerEntitlementInitialState = ReturnType<
	typeof computeCustomerEntitlementInitialState
>;

export type BatchMigrationAddEntitlementOp = {
	entitlementPrice: EntitlementPrice;
	initialState: CustomerEntitlementInitialState;
};

export type BatchMigrationRemoveEntitlementOp =
	| { by: "definition"; entitlementPrice: EntitlementPrice }
	| { by: "filter"; from: EntitlementPriceFilter };

export type BatchMigrationReplaceEntitlementOp =
	| {
			by: "definition";
			fromEntitlementPrice: EntitlementPrice;
			entitlementPrice: EntitlementPrice;
			initialState: CustomerEntitlementInitialState;
	  }
	| {
			by: "filter";
			from: EntitlementPriceFilter;
			entitlementPrice: EntitlementPrice;
			initialState: CustomerEntitlementInitialState;
	  };

type BatchMigrationLicenseOpTarget = {
	licensePlanId: string;
	planLicenseId: string;
	licenseInternalProductId: string;
	isOneOff: boolean;
};

export type BatchMigrationRepointLicensePoolOp =
	BatchMigrationLicenseOpTarget & {
		type: "repoint_license_pool";
	};

export type BatchMigrationAddLicenseEntitlementOp =
	BatchMigrationLicenseOpTarget & {
		type: "add_license_entitlement";
		entitlement: EntitlementWithFeature;
		initialState: CustomerEntitlementInitialState;
	};

export type BatchMigrationReplaceLicenseEntitlementOp =
	BatchMigrationLicenseOpTarget & {
		type: "replace_license_entitlement";
		fromEntitlementId: string;
		entitlement: EntitlementWithFeature;
		initialState: CustomerEntitlementInitialState;
	};

export type BatchMigrationRemoveLicenseEntitlementOp =
	BatchMigrationLicenseOpTarget & {
		type: "remove_license_entitlement";
		filter: PlanItemFilter;
	};

export type BatchMigrationLicenseEntitlementOp =
	| BatchMigrationRepointLicensePoolOp
	| BatchMigrationAddLicenseEntitlementOp
	| BatchMigrationReplaceLicenseEntitlementOp
	| BatchMigrationRemoveLicenseEntitlementOp;

export type BatchMigrationOperations = {
	addEntitlements: BatchMigrationAddEntitlementOp[];
	removeEntitlements: BatchMigrationRemoveEntitlementOp[];
	replaceEntitlements: BatchMigrationReplaceEntitlementOp[];
	licenseEntitlements: BatchMigrationLicenseEntitlementOp[];
	repointCustomerProduct?: CustomerProductTransition;
};
