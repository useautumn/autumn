import { debounce } from "lodash";
import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

type SecondaryTabType =
	| "api_keys"
	| "stripe"
	| "products"
	| "rewards"
	| "features"
	| "webhooks";

export const useAppQueryStates = ({
	defaultTab,
}: {
	defaultTab?: SecondaryTabType;
}) => {
	const [queryStates, setQueryStates] = useQueryStates({
		tab: parseAsString.withDefault(defaultTab || ""),
	});

	const [stableStates, setStableStates] = useState(queryStates);

	useEffect(() => {
		const debouncedSetStableStates = debounce((queryStates: any) => {
			setStableStates(queryStates);
		}, 50);
		debouncedSetStableStates(queryStates);
	}, [queryStates]);

	return {
		queryStates: stableStates,
		setQueryStates,
	};
};
