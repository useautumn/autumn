import type { Feature } from "@autumn/shared";
import { FeatureType } from "@autumn/shared";

const isUsageFeature = (feature: Feature) =>
	feature.type === FeatureType.Metered ||
	feature.type === FeatureType.CreditSystem;

/** Metered features and credit systems an event feeds: by `event_names`
 * first, falling back to an event named after the feature id. */
export const findFeaturesForEvent = ({
	eventName,
	features,
}: {
	eventName: string;
	features: Feature[];
}): Feature[] => {
	const byEventName = features.filter(
		(feature) =>
			isUsageFeature(feature) && feature.event_names?.includes(eventName),
	);
	if (byEventName.length > 0) return byEventName;

	return features.filter(
		(feature) => isUsageFeature(feature) && feature.id === eventName,
	);
};

export const describeLinkedFeatures = ({
	linkedFeatures,
}: {
	linkedFeatures: Feature[];
}): string | null => {
	if (linkedFeatures.length === 0) return null;
	if (linkedFeatures.length === 1) return linkedFeatures[0].name;
	return `${linkedFeatures[0].name} + ${linkedFeatures.length - 1} more`;
};

/** The feature name an event feeds, falling back to the raw event name. */
export const eventDisplayName = ({
	eventName,
	features,
}: {
	eventName: string;
	features: Feature[];
}): string =>
	describeLinkedFeatures({
		linkedFeatures: findFeaturesForEvent({ eventName, features }),
	}) ?? eventName;
