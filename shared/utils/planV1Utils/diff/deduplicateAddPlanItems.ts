import type { ApiPlanV1, CreatePlanItemParamsV1 } from "@autumn/shared";
import { buildPlanItemKey, PlanItemMatchPrecision } from "./diffPlanV1.js";

/** Adds supersede one same-cadence base item; ambiguous matches stay. */
export const deduplicateAddPlanItems = ({
	base,
	addItems,
}: {
	base: ApiPlanV1;
	addItems?: CreatePlanItemParamsV1[];
}): ApiPlanV1 => {
	const items = (addItems ?? []).reduce<ApiPlanV1["items"]>(
		(currentItems, addItem) => {
			const addKey = buildPlanItemKey({
				item: addItem,
				matchPrecision: PlanItemMatchPrecision.FeatureCadence,
			});
			const matchingIndexes = currentItems.flatMap((item, index) =>
				buildPlanItemKey({
					item,
					matchPrecision: PlanItemMatchPrecision.FeatureCadence,
				}) === addKey
					? [index]
					: [],
			);
			if (matchingIndexes.length !== 1) return currentItems;

			const [supersededIndex] = matchingIndexes;
			return currentItems.filter((_, index) => index !== supersededIndex);
		},
		base.items,
	);

	return items === base.items ? base : { ...base, items };
};
