import { type Feature, FeatureType } from "@autumn/shared";
import { useMemo } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { eventColor } from "@/views/customers/customer/analytics/utils/seriesColors";

export const useLogFeatures = () => {
	const { features } = useFeaturesQuery();

	return useMemo(() => {
		const trackable: Feature[] = features.filter(
			(f) => f.type !== FeatureType.Boolean && !f.archived,
		);
		const indexById = new Map(trackable.map((f, i) => [f.id, i]));
		const nameById = new Map(trackable.map((f) => [f.id, f.name]));

		const colorFor = (featureId: string) =>
			eventColor({ eventIndex: indexById.get(featureId) ?? trackable.length });
		const nameFor = (featureId: string) => nameById.get(featureId) ?? featureId;

		return { features: trackable, colorFor, nameFor };
	}, [features]);
};
