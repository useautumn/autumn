import type { FeatureConfigOverride } from "../../../models/featureModels/featureConfig/creditConfig.js";
import { dbFeatureOverrideToApi } from "../../featureUtils/apiFeatureToDbFeature.js";
import { featureOverrideToKey } from "../../planV1Utils/diff/compareFeatureOverrides.js";

/** A plan item's own credit rates split its grant into a pool of their own; no override is "none". */
export const featureOverrideToSignature = ({
	featureOverride,
}: {
	featureOverride?: FeatureConfigOverride | null;
}): string => {
	if (!featureOverride) return "none";
	const key = featureOverrideToKey(dbFeatureOverrideToApi(featureOverride));
	return key === featureOverrideToKey({}) ? "none" : key;
};
