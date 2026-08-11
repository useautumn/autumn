import {
	type ApiPlanV1,
	diffPlanV1,
	type LicenseCustomize,
} from "@autumn/shared";

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
