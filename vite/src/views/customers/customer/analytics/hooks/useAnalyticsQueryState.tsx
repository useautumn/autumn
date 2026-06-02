import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";

/**
 * URL-synced state for the analytics interval / custom date range controls.
 * `start` and `end` are epoch milliseconds and are only set when
 * `interval === "custom"`.
 */
export const useAnalyticsQueryState = () => {
	const [queryStates, setQueryStates] = useQueryStates(
		{
			interval: parseAsString.withDefault("30d"),
			bin_size: parseAsString,
			start: parseAsInteger,
			end: parseAsInteger,
		},
		{ history: "push" },
	);
	return { queryStates, setQueryStates };
};
