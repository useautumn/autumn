import type { ApiPlanLicenseV1 } from "@autumn/shared";
import { upsertProductPlanToLicenses } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/licensePlanUtils";
import type {
	PlanLicensePlan,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { toApiPlanLicenses } from "@/internal/licenses/licenseUtils";

const plannedLicensesPreview = ({
	planLicenses,
}: {
	planLicenses: PlanLicensePlan[];
}): ApiPlanLicenseV1[] =>
	planLicenses.flatMap((planLicense) => {
		if (planLicense.op === "remove") return [];
		if (!planLicense.licenseProduct) return [];
		return [
			{
				license_plan_id: planLicense.licensePlanId,
				version: planLicense.licenseProduct.version,
				included: planLicense.included,
				prepaid_only: planLicense.prepaidOnly,
			},
		];
	});

/** Echo declared licenses[] after the update, or the plan's current links. */
export const buildLicensesPreview = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): ApiPlanLicenseV1[] => {
	if (upsert.planLicenses) {
		return plannedLicensesPreview({ planLicenses: upsert.planLicenses });
	}
	return toApiPlanLicenses(upsertProductPlanToLicenses({ upsert }));
};
