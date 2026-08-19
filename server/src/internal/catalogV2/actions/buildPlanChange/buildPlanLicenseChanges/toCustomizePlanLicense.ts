import type { ApiPlanLicenseV1, CustomizePlanLicense } from "@autumn/shared";

export const toCustomizePlanLicense = ({
	snapshot,
	metadata,
}: {
	snapshot: ApiPlanLicenseV1;
	metadata?: Record<string, unknown> | null;
}): CustomizePlanLicense => ({
	license_plan_id: snapshot.license_plan_id,
	included: snapshot.included,
	prepaid_only: snapshot.prepaid_only,
	...(snapshot.customize ? { customize: snapshot.customize } : {}),
	...(metadata != null ? { metadata } : {}),
});
