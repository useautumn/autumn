import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getEffectiveBinSize } from "../utils/intervals";
import { useAnalyticsFilterState } from "./useAnalyticsFilterState";
import { useAnalyticsQueryState } from "./useAnalyticsQueryState";
import { type EventNameWithCount, useEventNames } from "./useEventNames";

export const useSelectedEventNames = () => {
	const { filterStates } = useAnalyticsFilterState();
	const {
		feature_ids: featureIds,
		event_names: eventNames,
		customer_id: customerId,
		entity_id: entityId,
	} = filterStates;

	const { queryStates } = useAnalyticsQueryState();
	const { interval, start, end } = queryStates;
	const binSize = getEffectiveBinSize({
		interval,
		binSize: queryStates.bin_size,
	});

	const {
		eventNames: cachedEventNames,
		isLoading,
		isRefreshing,
	} = useEventNames({
		customerId,
		entityId,
		interval,
		binSize,
		start,
		end,
		keepPrevious: true,
	});
	const eventNamesLoading = isLoading || isRefreshing;
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
