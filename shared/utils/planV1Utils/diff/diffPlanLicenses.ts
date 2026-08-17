import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import type { CustomizePlanLicense } from "@models/licenseModels/licenseModels.js";

type ApiPlanLicense = NonNullable<ApiPlanV1["licenses"]>[number];
type CustomizeEqual = (args: {
	left?: ApiPlanLicense["customize"];
	right?: ApiPlanLicense["customize"];
}) => boolean;

const byLicensePlanId = (licenses: ApiPlanV1["licenses"]) =>
	new Map(
		(licenses ?? []).map((license) => [license.license_plan_id, license]),
	);

/** A cleared customize is expressed as null so the op restores inheritance. */
const toCustomizeParams = (
	license: ApiPlanLicense,
): CustomizePlanLicense["customize"] => {
	const customize = license.customize;
	if (!customize) return null;
	return {
		...(customize.price !== undefined ? { price: customize.price } : {}),
		...(customize.add_items !== undefined
			? { add_items: customize.add_items }
			: {}),
		...(customize.remove_items !== undefined
			? { remove_items: customize.remove_items }
			: {}),
	};
};

/** Links present on both sides whose customize changed. Added and removed links
 * are link lifecycle, not plan terms, so they produce no entry. */
export const diffPlanLicenses = ({
	from,
	to,
	customizeEqual,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
	customizeEqual: CustomizeEqual;
}): CustomizePlanLicense[] => {
	const fromByPlanId = byLicensePlanId(from.licenses);

	const changed: CustomizePlanLicense[] = [];
	for (const toLicense of to.licenses ?? []) {
		const fromLicense = fromByPlanId.get(toLicense.license_plan_id);
		if (!fromLicense) continue;
		if (
			customizeEqual({
				left: fromLicense.customize,
				right: toLicense.customize,
			})
		) {
			continue;
		}
		changed.push({
			license_plan_id: toLicense.license_plan_id,
			customize: toCustomizeParams(toLicense),
		});
	}
	return changed;
};
