import {
	createParser,
	parseAsArrayOf,
	parseAsString,
	useQueryStates,
} from "nuqs";

const DEFAULT_MAX_GROUPS = 10;
const MIN_MAX_GROUPS = 1;
const MAX_MAX_GROUPS = 250;

// The aggregate endpoint rejects anything outside 1-250, so a hand-edited or
// bookmarked URL is clamped on the way in rather than failing the request.
export const clampMaxGroups = (value: number) =>
	Math.min(MAX_MAX_GROUPS, Math.max(MIN_MAX_GROUPS, value));

const parseAsMaxGroups = createParser({
	parse: (query) => {
		const parsed = Number.parseInt(query, 10);
		return Number.isNaN(parsed) ? null : clampMaxGroups(parsed);
	},
	serialize: String,
}).withDefault(DEFAULT_MAX_GROUPS);

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
			max_groups: parseAsMaxGroups,
			event_names: parseAsArrayOf(parseAsString),
			feature_ids: parseAsArrayOf(parseAsString),
		},
		{ history: "push" },
	);
	return { filterStates, setFilterStates };
};
