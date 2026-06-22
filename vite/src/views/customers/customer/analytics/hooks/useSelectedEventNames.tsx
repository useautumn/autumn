import { FeatureType } from "@autumn/shared";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { useMemo } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { type EventNameWithCount, useEventNames } from "./useEventNames";

/** Resolves the event names the analytics views filter by: explicit URL
 * selection (event_names / feature_ids) or the top metered events by default.
 * Shared by the chart and the events table so they stay in sync. */
export const useSelectedEventNames = () => {
	const [{ feature_ids: featureIds, event_names: eventNames }] = useQueryStates(
		{
			feature_ids: parseAsArrayOf(parseAsString),
			event_names: parseAsArrayOf(parseAsString),
		},
	);

	const { eventNames: cachedEventNames, isLoading: eventNamesLoading } =
		useEventNames();
	const { features: featuresData, isLoading: featuresLoading } =
		useFeaturesQuery();

	const featureLinkedEventNames = useMemo(() => {
		if (!featuresData?.length) {
			return cachedEventNames;
		}
		return cachedEventNames.filter((e: EventNameWithCount) =>
			featuresData.some(
				(f) =>
					(f.type === FeatureType.Metered ||
						f.type === FeatureType.CreditSystem) &&
					(f.event_names?.includes(e.event_name) || f.id === e.event_name),
			),
		);
	}, [cachedEventNames, featuresData]);

	const selectedEventNames =
		eventNames || featureIds
			? [...(eventNames || []), ...(featureIds || [])]
			: featureLinkedEventNames
					.slice(0, 3)
					.map((e: EventNameWithCount) => e.event_name);

	return {
		selectedEventNames,
		featuresData,
		featuresLoading,
		eventNamesLoading,
	};
};
