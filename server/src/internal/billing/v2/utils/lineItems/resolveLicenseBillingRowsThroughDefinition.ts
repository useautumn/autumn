import {
	type FullPlanLicense,
	type LicenseBillingPriceRow,
} from "@autumn/shared";

/** Selects projected rows for this definition, otherwise persisted rows. */
export const resolveLicenseBillingRowsThroughDefinition = ({
	licenseBillingRows,
	planLicense,
	projectedPlanLicenseIds,
}: {
	licenseBillingRows: LicenseBillingPriceRow[];
	planLicense: FullPlanLicense;
	projectedPlanLicenseIds: Set<string>;
}): LicenseBillingPriceRow[] => {
	const projectedRows = licenseBillingRows.filter(
		(row) => row.source.planLicenseId === planLicense.id,
	);
	if (projectedPlanLicenseIds.has(planLicense.id)) return projectedRows;
	return licenseBillingRows.filter((row) => !row.source.planLicenseId);
};
