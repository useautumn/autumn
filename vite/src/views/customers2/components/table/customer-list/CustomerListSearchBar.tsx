import { FilterChip, Input } from "@autumn/ui";
import { ListMagnifyingGlassIcon } from "@phosphor-icons/react";
import { debounce } from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	CLEARED_CUSTOMER_FILTERS,
	hasActiveCustomerFilters,
	useCustomerFilters,
} from "@/views/customers/hooks/useCustomerFilters";
import { useCustomerListFilterChips } from "./useCustomerListFilterChips";

export function CustomerListSearchBar() {
	const { queryStates, setFilters } = useCustomerFilters();
	const filterChips = useCustomerListFilterChips();

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
		<div className="flex h-input min-w-0 flex-1 cursor-text items-center gap-1.5 rounded-lg input-base input-shadow-default input-state-focus-within py-0 pr-1 pl-2.5">
			<ListMagnifyingGlassIcon
				size={16}
				className="shrink-0 text-tertiary-foreground pointer-events-none"
			/>
			{filterChips.length > 0 && (
				<div className="flex min-w-0 shrink items-center gap-1 overflow-hidden">
					{filterChips.map((chip) => (
						<FilterChip
							key={chip.key}
							label={chip.label}
							value={chip.value}
							onRemove={chip.onRemove}
						/>
					))}
				</div>
			)}
			<Input
				variant="headless"
				value={localQuery}
				onChange={(e) => {
					const raw = e.target.value;
					setLocalQuery(raw);
					debouncedSearch(raw.trim());
				}}
				className="h-full min-w-40 flex-1 text-sm"
				placeholder="Search customers"
			/>
			{hasActiveCustomerFilters(queryStates) && (
				<button
					type="button"
					onClick={() => setFilters(CLEARED_CUSTOMER_FILTERS)}
					className="flex h-5 shrink-0 cursor-pointer items-center rounded px-1.5 text-xs whitespace-nowrap text-tertiary-foreground hover:bg-active-primary hover:text-foreground"
				>
					Reset filters
				</button>
			)}
		</div>
	);
}
