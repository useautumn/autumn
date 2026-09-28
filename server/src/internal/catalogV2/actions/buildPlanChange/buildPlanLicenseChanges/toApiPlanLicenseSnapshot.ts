import type { ApiPlanLicenseV1, Feature, FullPlanLicense } from "@autumn/shared";
import { toApiPlanLicenses } from "@/internal/licenses/licenseUtils";
import { fullPlanLicenseToCustomize } from "./fullPlanLicenseToCustomize.js";

export const toApiPlanLicenseSnapshot = ({
	license,
	features,
}: {
	license: FullPlanLicense;
	features?: Feature[];
}): ApiPlanLicenseV1 => {
	const customize = fullPlanLicenseToCustomize({ license, features });
	return {
		...toApiPlanLicenses([license])[0],
		...(customize ? { customize } : {}),
	};
};
