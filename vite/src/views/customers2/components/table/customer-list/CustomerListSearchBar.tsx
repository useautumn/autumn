import { ListMagnifyingGlassIcon } from "@phosphor-icons/react";
import { debounce } from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/v2/inputs/Input";
import { useCusSearchQuery } from "@/views/customers/hooks/useCusSearchQuery";
import { useCustomerFilters } from "@/views/customers/hooks/useCustomerFilters";

export function CustomerListSearchBar() {
	const { queryStates, setFilters } = useCustomerFilters();
	const { totalCount } = useCusSearchQuery();

	const setFiltersRef = useRef(setFilters);
	setFiltersRef.current = setFilters;

	const lastPushedRef = useRef(queryStates.q);

	const debouncedSearch = useMemo(
		() =>
			debounce((query: string) => {
				lastPushedRef.current = query;
				setFiltersRef.current({ q: query });
			}, 350),
		[],
	);

	useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

	const [localQuery, setLocalQuery] = useState(queryStates.q);

	// When the URL value changes from something other than our own debounce
	// (e.g. saved view applied, filter restore), sync the input to match.
	if (queryStates.q !== lastPushedRef.current) {
		lastPushedRef.current = queryStates.q;
		setLocalQuery(queryStates.q);
		debouncedSearch.cancel();
	}

	return (
		<div className="relative flex items-center flex-1 min-w-0">
			<ListMagnifyingGlassIcon
				size={16}
				className="text-t3 absolute left-2.5 pointer-events-none"
			/>
			<Input
				value={localQuery}
			onChange={(e) => {
				const raw = e.target.value;
				setLocalQuery(raw);
				debouncedSearch(raw.trim());
			}}
				className="pl-8! text-sm w-sm"
				placeholder={`Search ${Intl.NumberFormat("en-US").format(totalCount)} customers`}
			/>
		</div>
	);
}
