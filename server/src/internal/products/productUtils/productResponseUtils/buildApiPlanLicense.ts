import type {
	ApiPlanLicenseV1,
	ApiPlanLicenseWithPlanV1,
	Feature,
	FullPlanLicense,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { diffLicensePlanCustomize } from "@/internal/licenses/actions/customize/diffLicensePlanCustomize.js";
import { toApiPlanLicenses } from "@/internal/licenses/licenseUtils.js";
import { getPlanResponse } from "./getPlanResponse.js";

type BuildApiPlanLicenseArgs = {
	ctx?: AutumnContext;
	license: FullPlanLicense;
	features: Feature[];
	expand?: string[];
	currency?: string;
};

/**
 * Render a license link edge: thin entry + customize diff, with the link's
 * effective plan attached when expandPlan is set. Each plan renders exactly once.
 */
export async function buildApiPlanLicense(
	args: BuildApiPlanLicenseArgs & { expandPlan: true },
): Promise<ApiPlanLicenseWithPlanV1>;
export async function buildApiPlanLicense(
	args: BuildApiPlanLicenseArgs & { expandPlan?: false },
): Promise<ApiPlanLicenseV1>;
export async function buildApiPlanLicense({
	ctx,
	license,
	features,
	expand,
	currency,
	expandPlan = false,
}: BuildApiPlanLicenseArgs & { expandPlan?: boolean }): Promise<
	ApiPlanLicenseV1 | ApiPlanLicenseWithPlanV1
> {
	const entry = toApiPlanLicenses([license])[0];

	const isCustomized = Boolean(license.customized && license.base_product);
	if (!expandPlan && !isCustomized) return entry;

	const renderPlan = (product: FullPlanLicense["product"]) =>
		getPlanResponse({
			ctx,
			product,
			features,
			expand,
			currency,
			resolveBaseFullProduct: false,
		});

	const [effectivePlan, linkBasePlan] = await Promise.all([
		renderPlan(license.product),
		isCustomized && license.base_product
			? renderPlan(license.base_product)
			: null,
	]);
	const customize = linkBasePlan
		? diffLicensePlanCustomize({ basePlan: linkBasePlan, effectivePlan })
		: undefined;

	return {
		...entry,
		...(customize ? { customize } : {}),
		...(expandPlan ? { plan: effectivePlan } : {}),
	};
}
