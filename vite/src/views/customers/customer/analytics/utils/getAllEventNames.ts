import { type Feature, FeatureType, FeatureUsageType } from "@autumn/shared";

export const getAllEventNames = ({ features }: { features: Feature[] }) => {
	return features.flatMap((feature: Feature) => {
		if (feature.type !== FeatureType.Metered) return [];
		const eventNames = feature.event_names || [];

		return eventNames.filter(
			(name: string) =>
				!features.some(
					(f: Feature) =>
						f.id == name && f.config.usage_type == "continuous_use",
				),
		);
	});
};

export const eventNameBelongsToFeature = ({
	eventName,
	features,
}: {
	eventName: string;
	features: Feature[];
}) => {
	return features.some(
		(feature: Feature) =>
			feature.type === FeatureType.Metered &&
			feature.config.usage_type === FeatureUsageType.Single &&
			feature.event_names &&
			feature.event_names.includes(eventName),
	);
};
