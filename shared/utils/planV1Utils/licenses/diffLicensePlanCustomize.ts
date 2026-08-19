import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import type { LicenseCustomize } from "@models/licenseModels/licenseModels.js";
import { diffPlanV1 } from "../diff/diffPlanV1.js";

/** Re-express an effective plan as a customize off its base plan.
 * Undefined means the effective plan matches the base — stock link. */
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
