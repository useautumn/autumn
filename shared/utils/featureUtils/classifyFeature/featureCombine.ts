import { FeatureCombine } from "@models/featureModels/featureEnums";
import type { Feature } from "@models/featureModels/featureModels";

/** The feature's combine rule; anything unset or unknown adds up, as before the setting existed. */
export const featureToCombine = ({
	feature,
}: {
	feature: Pick<Feature, "config">;
}): FeatureCombine => {
	const combine = feature.config?.combine;
	return combine === FeatureCombine.Max || combine === FeatureCombine.Min
		? combine
		: FeatureCombine.Sum;
};

/** Plans' unpriced grants of this feature compete (highest or lowest wins) instead of adding up. */
export const isCompetingCombineFeature = ({
	feature,
}: {
	feature: Pick<Feature, "config">;
}) => featureToCombine({ feature }) !== FeatureCombine.Sum;
