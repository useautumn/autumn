import type {
	CustomizePlanLicense,
	FullCustomerLicense,
	LicenseQuantityParams,
} from "@autumn/shared";

export function customerLicensesToQuantityTotals({
	customerLicenses,
}: {
	customerLicenses: FullCustomerLicense[];
}): Record<string, number> {
	const quantities: Record<string, number> = {};

	for (const customerLicense of customerLicenses) {
		const licensePlanId = customerLicense.planLicense?.product.id;
		if (licensePlanId) quantities[licensePlanId] = customerLicense.granted;
	}

	return quantities;
}

/**
 * Converts staged license seat totals into license_quantities params.
 * Unset quantities are omitted so the backend defaults to included seats.
 */
export function convertLicenseQuantitiesToParams({
	licenseQuantities,
	initialLicenseQuantities = {},
}: {
	licenseQuantities: Record<string, number | undefined>;
	initialLicenseQuantities?: Record<string, number | undefined>;
}): LicenseQuantityParams[] | undefined {
	const params: LicenseQuantityParams[] = [];

	for (const [licensePlanId, quantity] of Object.entries(licenseQuantities)) {
		if (
			quantity === undefined ||
			quantity === initialLicenseQuantities[licensePlanId]
		) {
			continue;
		}
		params.push({ license_plan_id: licensePlanId, quantity });
	}

	return params.length > 0 ? params : undefined;
}

/**
 * Raises staged seat totals that fell below a customized included amount,
 * since total seats are always inclusive of included.
 */
export function clampLicenseQuantitiesToIncluded({
	licenseQuantities,
	upsertLicenses,
}: {
	licenseQuantities: Record<string, number | undefined>;
	upsertLicenses: CustomizePlanLicense[];
}): Record<string, number | undefined> {
	const clamped = { ...licenseQuantities };

	for (const license of upsertLicenses) {
		const quantity = clamped[license.license_plan_id];
		if (
			license.included !== undefined &&
			quantity !== undefined &&
			quantity < license.included
		) {
			clamped[license.license_plan_id] = license.included;
		}
	}

	return clamped;
}
