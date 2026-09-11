import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useAnalyticsFilterState } from "./useAnalyticsFilterState";
import { useAnalyticsQueryState } from "./useAnalyticsQueryState";
import { type EventNameWithCount, useEventNames } from "./useEventNames";

/** Resolves the event names the analytics views filter by: explicit URL
 * selection (event_names / feature_ids) or the top events by count in the
 * active window by default. Shared by the chart and the events table. */
export const useSelectedEventNames = () => {
	const { filterStates } = useAnalyticsFilterState();
	const { feature_ids: featureIds, event_names: eventNames } = filterStates;

	const { queryStates } = useAnalyticsQueryState();
	const { interval, start, end } = queryStates;

	const { eventNames: cachedEventNames, isLoading: eventNamesLoading } =
		useEventNames({ interval, start, end });
	const { features: featuresData, isLoading: featuresLoading } =
		useFeaturesQuery();

	const defaultEventNames = cachedEventNames
		.slice(0, 3)
		.map((e: EventNameWithCount) => e.event_name);

	const hasExplicitSelection = Boolean(eventNames || featureIds);

	const selectedEventNames = hasExplicitSelection
		? [...(eventNames || []), ...(featureIds || [])]
		: defaultEventNames;

	return {
		selectedEventNames,
		hasExplicitSelection,
		featuresData,
		featuresLoading,
		eventNamesLoading,
	};
};
