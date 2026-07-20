import type {
	CustomizePlanLicense,
	FullCustomerLicense,
	LicenseQuantityParams,
} from "@autumn/shared";
import { customerLicenseToGranted } from "@autumn/shared";

/** Current purchased totals (included + paid) per license plan on a customer
 * product. Keyed by the license product's public id — the DB planLicense row
 * only carries internal ids. */
export function customerLicenseTotals({
	customerLicenses,
}: {
	customerLicenses: FullCustomerLicense[] | null | undefined;
}): Record<string, number> {
	const totals: Record<string, number> = {};
	for (const customerLicense of customerLicenses ?? []) {
		const { planLicense } = customerLicense;
		if (!planLicense) continue;
		totals[planLicense.product.id] = customerLicenseToGranted({
			customerLicense,
			planLicense,
		});
	}
	return totals;
}

/** True when any staged seat total differs from the customer's current total. */
export function hasStagedLicenseQuantityChanges({
	licenseQuantities,
	initialLicenseQuantities,
}: {
	licenseQuantities: Record<string, number | undefined> | undefined;
	initialLicenseQuantities: Record<string, number> | undefined;
}): boolean {
	return Object.entries(licenseQuantities ?? {}).some(
		([licenseId, quantity]) =>
			quantity !== undefined &&
			quantity !== initialLicenseQuantities?.[licenseId],
	);
}

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
