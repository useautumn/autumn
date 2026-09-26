import { Input } from "@autumn/ui";
import { ListMagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { debounce } from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	CLEARED_CUSTOMER_FILTERS,
	hasActiveCustomerFilters,
	useCustomerFilters,
} from "@/views/customers/hooks/useCustomerFilters";
import {
	type CustomerListFilterChip,
	useCustomerListFilterChips,
} from "./useCustomerListFilterChips";

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
						<CustomerListFilterChipTag key={chip.key} chip={chip} />
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
					className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-primary hover:bg-active-primary"
				>
					Reset filters
				</button>
			)}
		</div>
	);
}

function CustomerListFilterChipTag({ chip }: { chip: CustomerListFilterChip }) {
	return (
		<span className="flex h-5 max-w-56 shrink-0 items-center gap-1 rounded bg-active-primary pr-0.5 pl-1.5 text-xs">
			<span className="shrink-0 text-subtle">{chip.label}</span>
			<span className="truncate text-foreground">{chip.value}</span>
			<button
				type="button"
				aria-label={`Remove ${chip.label} filter`}
				onClick={chip.onRemove}
				className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-tertiary-foreground hover:bg-primary/10 hover:text-foreground"
			>
				<XIcon size={10} weight="bold" />
			</button>
		</span>
	);
}
