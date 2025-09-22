import {
	parseAsArrayOf,
	parseAsBoolean,
	parseAsInteger,
	parseAsString,
} from "nuqs";

import { useQueryStates } from "nuqs";
import { useLocation } from "react-router";
import { useCallback, useEffect, useState } from "react";
import { debounce } from "lodash";

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

	const [stableStates, setStableStates] = useState(queryStates);

	useEffect(() => {
		const debouncedSetStableStates = debounce((queryStates: any) => {
			setStableStates(queryStates);
		}, 50);
		debouncedSetStableStates(queryStates);
	}, [queryStates]);

	return { queryStates: stableStates, setQueryStates };
};
