import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";

export const useAnalyticsQueryState = () => {
	const [queryStates, setQueryStates] = useQueryStates(
		{
			interval: parseAsString.withDefault("30d"),
			aggregate_on: parseAsString,
			measure: parseAsString,
			bin_size: parseAsString,
			start: parseAsInteger,
			end: parseAsInteger,
		},
		{ history: "push" },
	);
	return { queryStates, setQueryStates };
};
