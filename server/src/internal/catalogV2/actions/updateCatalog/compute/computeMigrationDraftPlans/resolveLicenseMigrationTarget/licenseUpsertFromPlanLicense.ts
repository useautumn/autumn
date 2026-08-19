import {
	type CustomizePlanLicense,
	planDiffHasBillingChanges,
} from "@autumn/shared";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange";
import { licenseEffectiveMigratableCustomize } from "@/internal/catalogV2/actions/updateCatalog/compute/computeMigrationDraftPlans/resolveLicenseMigrationTarget/licenseEffectiveMigratableCustomize";
import type { PlanLicensePlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

export type LicenseDraftUpsert = {
	upsert: CustomizePlanLicense;
	hasBillingChanges: boolean;
};

export type LicenseDraftUpserts = {
	upserts: CustomizePlanLicense[];
	hasBillingChanges: boolean;
	includeCustom: boolean;
};

/** One link's current → effective content, wrapped as an `upsert_licenses` entry. */
export const licenseUpsertFromPlanLicense = ({
	planLicense,
}: {
	planLicense: PlanLicensePlan;
}): LicenseDraftUpsert | null => {
	if (!planLicense.currentPlanLicense || !planLicense.effectiveLicenseProduct) {
		return null;
	}

	const customize = licenseEffectiveMigratableCustomize({
		fromProduct: planLicense.currentPlanLicense.product,
		toProduct: planLicense.effectiveLicenseProduct,
	});
	if (!customize) return null;

	return {
		upsert: {
			license_plan_id: planLicense.licensePlanId,
			customize,
		},
		hasBillingChanges: planDiffHasBillingChanges(
			customize,
			fullProductToApiPlanV1Sync({
				product: planLicense.currentPlanLicense.product,
			}),
		),
	};
};

export const sortLicenseDraftUpserts = (
	upserts: CustomizePlanLicense[],
): CustomizePlanLicense[] =>
	[...upserts].sort((left, right) =>
		left.license_plan_id.localeCompare(right.license_plan_id),
	);
