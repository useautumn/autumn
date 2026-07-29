import type { FullPlanLicense, LicenseBillingPriceRow } from "@autumn/shared";

/** Selects projected rows for this definition, otherwise persisted rows. */
export const resolveLicenseBillingRowsThroughDefinition = ({
	licenseBillingRows,
	planLicense,
	projectedPlanLicenseIds,
}: {
	licenseBillingRows: LicenseBillingPriceRow[];
	planLicense: FullPlanLicense;
	projectedPlanLicenseIds: string[];
}): LicenseBillingPriceRow[] => {
	const projectedRows = licenseBillingRows.filter(
		(row) => row.source.planLicenseId === planLicense.id,
	);
	if (projectedPlanLicenseIds.includes(planLicense.id)) return projectedRows;
	return licenseBillingRows.filter((row) => !row.source.planLicenseId);
};
