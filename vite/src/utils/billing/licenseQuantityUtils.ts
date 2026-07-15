import type {
	CustomizePlanLicense,
	LicenseQuantityParams,
} from "@autumn/shared";

/**
 * Converts staged license seat totals into license_quantities params.
 * Unset quantities are omitted so the backend defaults to included seats.
 */
export function convertLicenseQuantitiesToParams({
	licenseQuantities,
}: {
	licenseQuantities: Record<string, number | undefined>;
}): LicenseQuantityParams[] | undefined {
	const params: LicenseQuantityParams[] = [];

	for (const [licensePlanId, quantity] of Object.entries(licenseQuantities)) {
		if (quantity === undefined) continue;
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
