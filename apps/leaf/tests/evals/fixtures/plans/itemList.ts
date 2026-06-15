import type { ApiFeatureV1 } from "@api/features/apiFeatureV1.js";
import type { ApiPlanItemV1 } from "@api/products/items/apiPlanItemV1.js";
import { items } from "./items.js";

/** Build repeated plan item lists from keyed feature refs. */
export const itemList = {
	boolean: <const FeatureId extends string>({
		featureIds,
		features,
	}: {
		featureIds: readonly FeatureId[];
		features: Record<FeatureId, ApiFeatureV1>;
	}): ApiPlanItemV1[] =>
		featureIds.map((featureId) =>
			items.boolean({ feature: features[featureId] }),
		),
} as const;
