import { type Feature, FeatureType } from "@autumn/shared";
import { useMemo } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	OTHER_SERIES_COLOR,
	seriesSlotColor,
} from "@/views/customers/customer/analytics/utils/seriesColors";

/** Trackable features, with a stable dot color and display name per feature id. */
export const useLogFeatures = () => {
	const { features, isLoading } = useFeaturesQuery();

	return useMemo(() => {
		const trackable: Feature[] = features.filter(
			(f) => f.type !== FeatureType.Boolean && !f.archived,
		);
		const indexById = new Map(trackable.map((f, i) => [f.id, i]));
		const nameById = new Map(trackable.map((f) => [f.id, f.name]));

		const colorFor = (featureId: string) => {
			const index = indexById.get(featureId);
			return index === undefined
				? OTHER_SERIES_COLOR
				: seriesSlotColor({ index });
		};
		const nameFor = (featureId: string) => nameById.get(featureId) ?? featureId;

		return { features: trackable, isLoading, colorFor, nameFor };
	}, [features, isLoading]);
};
