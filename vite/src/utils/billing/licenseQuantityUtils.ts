import type {
	CustomizePlanLicense,
	FullCustomerLicense,
	LicenseQuantityParams,
} from "@autumn/shared";
import { customerLicenseToGranted } from "@autumn/shared";

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
