import {
	parseAsArrayOf,
	parseAsInteger,
	parseAsString,
	useQueryStates,
} from "nuqs";

const DEFAULT_MAX_GROUPS = 10;

/**
 * URL-synced state for the analytics filter controls. Every analytics reader
 * and writer goes through nuqs: it applies each change to the live URL, whereas
 * react-router rebuilds the query string from a `useLocation` snapshot that
 * nuqs' shallow history push never reaches — which silently dropped whichever
 * param the other control had just written.
 */
export const useAnalyticsFilterState = () => {
	const [filterStates, setFilterStates] = useQueryStates(
		{
			customer_id: parseAsString,
			entity_id: parseAsString,
			group_by: parseAsString,
			max_groups: parseAsInteger.withDefault(DEFAULT_MAX_GROUPS),
			event_names: parseAsArrayOf(parseAsString),
			feature_ids: parseAsArrayOf(parseAsString),
		},
		{ history: "push" },
	);
	return { filterStates, setFilterStates };
};
