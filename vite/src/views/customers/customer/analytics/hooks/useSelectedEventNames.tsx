import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getEffectiveBinSize } from "../utils/intervals";
import { useAnalyticsQueryState } from "./useAnalyticsQueryState";
import { type EventNameWithCount, useEventNames } from "./useEventNames";

/** Resolves the event names the analytics views filter by: explicit URL
 * selection (event_names / feature_ids) or the top events by count in the
 * active window by default. Shared by the chart and the events table. */
export const useSelectedEventNames = () => {
	const [{ feature_ids: featureIds, event_names: eventNames }] = useQueryStates(
		{
			feature_ids: parseAsArrayOf(parseAsString),
			event_names: parseAsArrayOf(parseAsString),
		},
	);

	const { queryStates } = useAnalyticsQueryState();
	const { interval, start, end } = queryStates;
	const binSize = getEffectiveBinSize({
		interval,
		binSize: queryStates.bin_size,
	});

	const { eventNames: cachedEventNames, isLoading: eventNamesLoading } =
		useEventNames({ interval, binSize, start, end });
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
