import type { ApiPlanLicenseV1 } from "@api/products/apiPlanLicenseV1";
import type { FullPlanLicense } from "@models/licenseModels/fullPlanLicenseModel";
import { diffLicensePlanCustomize } from "@utils/planV1Utils/licenses/diffLicensePlanCustomize";
import { fullProductToApiPlan } from "../fullProductToApiPlan";
import type { ApiPlanContext } from "../types/apiPlanContext";
import { fullPlanLicensesToApiPlanLicenses } from "./fullPlanLicensesToApiPlanLicenses";

/**
 * One license link edge: the thin entry plus its customize diff, with the link's
 * effective plan attached when expandPlan is set. Each plan renders exactly once.
 */
export const fullPlanLicenseToApiPlanLicense = ({
	ctx,
	license,
	currency,
	expandPlan = false,
}: {
	ctx: ApiPlanContext;
	license: FullPlanLicense;
	currency?: string;
	expandPlan?: boolean;
}): ApiPlanLicenseV1 => {
	const [entry] = fullPlanLicensesToApiPlanLicenses({ licenses: [license] });

	const isCustomized = Boolean(license.customized && license.base_product);
	if (!expandPlan && !isCustomized) return entry;

	const renderPlan = (product: FullPlanLicense["product"]) =>
		fullProductToApiPlan({ ctx, product, currency });

	const effectivePlan = renderPlan(license.product);
	const linkBasePlan =
		isCustomized && license.base_product
			? renderPlan(license.base_product)
			: null;
	const customize = linkBasePlan
		? diffLicensePlanCustomize({ basePlan: linkBasePlan, effectivePlan })
		: undefined;

	return {
		...entry,
		...(customize ? { customize } : {}),
		...(expandPlan ? { plan: effectivePlan } : {}),
	};
};
