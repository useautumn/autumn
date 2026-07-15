import type { CustomizePlanLicense } from "@autumn/shared";

/**
 * Overlays included-quantity edits staged from the attach summary rows onto
 * the upsert_licenses patch, so both stay a single source of truth.
 */
export function mergeLicenseIncludedQuantities({
	addLicenses,
	licenseIncludedQuantities,
}: {
	addLicenses: CustomizePlanLicense[] | null;
	licenseIncludedQuantities: Record<string, number | undefined>;
}): CustomizePlanLicense[] | null {
	const overrides = Object.entries(licenseIncludedQuantities).filter(
		([, included]) => included !== undefined,
	);
	if (overrides.length === 0) return addLicenses;

	const merged = (addLicenses ?? []).map((license) => {
		const included = licenseIncludedQuantities[license.license_plan_id];
		return included === undefined ? license : { ...license, included };
	});

	const patchedIds = new Set(merged.map((license) => license.license_plan_id));
	for (const [licensePlanId, included] of overrides) {
		if (included !== undefined && !patchedIds.has(licensePlanId)) {
			merged.push({ license_plan_id: licensePlanId, included });
		}
	}

	return merged;
}
