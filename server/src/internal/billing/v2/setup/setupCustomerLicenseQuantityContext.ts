import type {
	CustomerLicenseQuantity,
	LicenseQuantityParams,
} from "@autumn/shared";

/** Requested total seat quantities for this billing action; params-only for now. */
export const setupCustomerLicenseQuantityContext = ({
	params,
}: {
	params: { license_quantities?: LicenseQuantityParams[] };
}): CustomerLicenseQuantity[] =>
	(params.license_quantities ?? []).map((licenseQuantity) => ({
		licensePlanId: licenseQuantity.license_plan_id,
		totalQuantity: licenseQuantity.quantity,
	}));
