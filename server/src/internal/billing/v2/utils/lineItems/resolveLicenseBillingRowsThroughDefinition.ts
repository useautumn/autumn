import type { FullPlanLicense, LicenseBillingPriceRow } from "@autumn/shared";

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
