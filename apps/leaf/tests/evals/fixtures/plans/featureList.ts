import type { ApiFeatureV1 } from "@api/features/apiFeatureV1.js";
import { features } from "./features.js";

/** Build keyed feature records for org-like setups with many boolean flags. */
export const featureList = {
	boolean: <const FeatureId extends string>({
		featureIds,
		names = {},
	}: {
		featureIds: readonly FeatureId[];
		names?: Partial<Record<FeatureId, string>>;
	}): Record<FeatureId, ApiFeatureV1> =>
		Object.fromEntries(
			featureIds.map((featureId) => [
				featureId,
				features.boolean({ featureId, name: names[featureId] }),
			]),
		) as Record<FeatureId, ApiFeatureV1>,
} as const;
