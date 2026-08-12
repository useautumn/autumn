import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";

/**
 * URL-synced state for the analytics interval / custom date range controls.
 * `start` and `end` are epoch milliseconds and are only set when
 * `interval === "custom"`. `aggregate_on` toggles the deduction breakdown.
 */
export const useAnalyticsQueryState = () => {
	const [queryStates, setQueryStates] = useQueryStates(
		{
			interval: parseAsString.withDefault("30d"),
			// "deducted" swaps the view from tracked usage to what each balance
			// actually gave up. Only valid with a customer selected.
			aggregate_on: parseAsString,
			bin_size: parseAsString,
			start: parseAsInteger,
			end: parseAsInteger,
		},
		{ history: "push" },
	);
	return { queryStates, setQueryStates };
};
