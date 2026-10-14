import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import { applyDiff, dedupeItemsByMatchKey } from "../diff/applyDiff.js";
import {
	composeMatchKey,
	type DiffedCustomizePlanV1,
} from "../diff/diffPlanV1.js";

export const applyLicenseCustomizeToBasePlan = ({
	basePlan,
	customize,
}: {
	basePlan: ApiPlanV1;
	customize: DiffedCustomizePlanV1;
}): ApiPlanV1 => {
	const customizedKeys = new Set(
		(customize.add_items ?? []).map((item) => composeMatchKey(item)),
	);
	const baseWithoutCustomizedSlots = {
		...basePlan,
		items: basePlan.items.filter(
			(item) => !customizedKeys.has(composeMatchKey(item)),
		),
	};

	const applied = applyDiff({
		base: baseWithoutCustomizedSlots,
		diff: customize,
	});
	return {
		...baseWithoutCustomizedSlots,
		...applied,
		items: dedupeItemsByMatchKey(applied.items),
	};
};
