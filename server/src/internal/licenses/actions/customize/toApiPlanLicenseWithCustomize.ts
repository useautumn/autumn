import {
	type ApiPlanV1,
	diffPlanV1,
	type FullPlanLicense,
	type LicenseCustomize,
} from "@autumn/shared";
import { toApiPlanLicenses } from "@/internal/licenses/licenseUtils.js";

export const diffLicensePlanCustomize = ({
	basePlan,
	effectivePlan,
}: {
	basePlan: ApiPlanV1;
	effectivePlan: ApiPlanV1;
}): LicenseCustomize | undefined => {
	const diff = diffPlanV1({ from: basePlan, to: effectivePlan });
	const customize = {
		...(diff.price !== undefined ? { price: diff.price } : {}),
		...(diff.add_items !== undefined ? { add_items: diff.add_items } : {}),
		...(diff.remove_items !== undefined
			? { remove_items: diff.remove_items }
			: {}),
	};
	return Object.keys(customize).length > 0 ? customize : undefined;
};

export const toApiPlanLicenseWithCustomize = async ({
	license,
	resolvePlan,
}: {
	license: FullPlanLicense;
	resolvePlan: (product: FullPlanLicense["product"]) => Promise<ApiPlanV1>;
}) => {
	const response = toApiPlanLicenses([license])[0];
	if (!license.customized || !license.base_product) return response;

	const [basePlan, effectivePlan] = await Promise.all([
		resolvePlan(license.base_product),
		resolvePlan(license.product),
	]);
	const customize = diffLicensePlanCustomize({ basePlan, effectivePlan });

	return {
		...response,
		...(customize ? { customize } : {}),
	};
};

export const toPlanLicenseParamsWithCustomize = async (
	args: Parameters<typeof toApiPlanLicenseWithCustomize>[0],
) => {
	const { version: _, ...license } = await toApiPlanLicenseWithCustomize(args);
	return license;
};
