import type {
	ApiPlanLicenseV1,
	Feature,
	FullPlanLicense,
} from "@autumn/shared";
import { fullPlanLicensesToApiPlanLicenses } from "@autumn/shared";
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
		...fullPlanLicensesToApiPlanLicenses({ licenses: [license] })[0],
		...(customize ? { customize } : {}),
	};
};
