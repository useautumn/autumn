import { useAnalyticsFilterState } from "./useAnalyticsFilterState";
import { useAnalyticsQueryState } from "./useAnalyticsQueryState";

/** Clears every analytics filter back to the page defaults. */
export const useResetQuery = () => {
	const { setFilterStates } = useAnalyticsFilterState();
	const { setQueryStates } = useAnalyticsQueryState();

	return () => {
		setFilterStates({
			customer_id: null,
			entity_id: null,
			group_by: null,
			max_groups: null,
			event_names: null,
			feature_ids: null,
		});
		setQueryStates({
			interval: null,
			aggregate_on: null,
			bin_size: null,
			start: null,
			end: null,
		});
	};
};
