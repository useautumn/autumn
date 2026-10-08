import { type Feature, FeatureType } from "@autumn/shared";
import { useMemo } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";

/** Trackable features, with a display name per feature id. */
export const useLogFeatures = () => {
	const { features } = useFeaturesQuery();

	return useMemo(() => {
		const trackable: Feature[] = features.filter(
			(f) => f.type !== FeatureType.Boolean && !f.archived,
		);
		const nameById = new Map(trackable.map((f) => [f.id, f.name]));

		const nameFor = (featureId: string) => nameById.get(featureId) ?? featureId;

		return { features: trackable, nameFor };
	}, [features]);
};
