import { debounce } from "lodash";
import {
	parseAsArrayOf,
	parseAsBoolean,
	parseAsInteger,
	parseAsString,
	useQueryStates,
} from "nuqs";
import { useEffect, useState } from "react";
export const useCustomersQueryStates = () => {
	const [queryStates, setQueryStates] = useQueryStates(
		{
			q: parseAsString.withDefault(""),
			status: parseAsArrayOf(parseAsString).withDefault([]),
			version: parseAsArrayOf(parseAsString).withDefault([]),
			none: parseAsBoolean.withDefault(false),
			page: parseAsInteger.withDefault(1),
			lastItemId: parseAsString.withDefault(""),
		},
		{
			history: "replace",
		},
	);

	// return { queryStates, setQueryStates };

	const [stableStates, setStableStates] = useState(queryStates);

	useEffect(() => {
		const debouncedSetStableStates = debounce((queryStates: any) => {
			setStableStates(queryStates);
		}, 50);
		debouncedSetStableStates(queryStates);
	}, [queryStates]);

	return { queryStates: stableStates, setQueryStates };
};
