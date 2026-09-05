import type { ApiPlanLicenseV1 } from "@autumn/shared";
import { upsertProductPlanToLicenses } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/licensePlanUtils";
import { planLicensesPlanToFullPlanLicenses } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/planLicensesPlanToFullPlanLicenses";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { toApiPlanLicenses } from "@/internal/licenses/licenseUtils";

/** Echo declared licenses[] after the update, or the plan's current links. */
export const buildLicensesPreview = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): ApiPlanLicenseV1[] => {
	if (upsert.planLicenses) {
		return toApiPlanLicenses(
			planLicensesPlanToFullPlanLicenses({
				planLicenses: upsert.planLicenses,
				parentInternalProductId: upsert.row.nextFullProduct.internal_id,
			}),
		);
	}
	return toApiPlanLicenses(upsertProductPlanToLicenses({ upsert }));
};
