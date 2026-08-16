import type { Feature, FullPlanLicense, LicenseCustomize } from "@autumn/shared";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange/fullProductToApiPlanV1Sync";
import { diffLicensePlanCustomize } from "@/internal/licenses/actions/customize/diffLicensePlanCustomize.js";

export const fullPlanLicenseToCustomize = ({
	license,
	features,
}: {
	license: FullPlanLicense;
	features?: Feature[];
}): LicenseCustomize | undefined => {
	if (!license.customized || !license.base_product) return undefined;
	return diffLicensePlanCustomize({
		basePlan: fullProductToApiPlanV1Sync({
			product: license.base_product,
			features,
		}),
		effectivePlan: fullProductToApiPlanV1Sync({
			product: license.product,
			features,
		}),
	});
};
