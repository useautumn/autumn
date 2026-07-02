import type {
	AutumnBillingPlan,
	DbCustomerProductLicense,
	DbPlanLicense,
} from "@autumn/shared";

export type CustomLicenseChange = NonNullable<
	AutumnBillingPlan["customLicenses"]
>[number];

export type LicenseDefinition = Pick<
	DbPlanLicense | DbCustomerProductLicense,
	| "license_internal_product_id"
	| "included_quantity"
	| "pooled_feature_ids"
	| "customize"
	| "metadata"
>;
