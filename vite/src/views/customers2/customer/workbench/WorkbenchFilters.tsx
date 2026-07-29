import { Input } from "@autumn/ui";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
	filterMethods,
	filterStatuses,
} from "@/hooks/queries/useCusRequestLogsQuery";
import { useWorkbenchStore } from "@/hooks/stores/useWorkbenchStore";
import { WorkbenchFilterSelect } from "./WorkbenchFilterSelect";

const SEARCH_DEBOUNCE_MS = 300;

export const WorkbenchFilters = () => {
	const filters = useWorkbenchStore((s) => s.filters);
	const setFilters = useWorkbenchStore((s) => s.setFilters);

	const [searchInput, setSearchInput] = useState(filters.search);

	useEffect(() => {
		if (searchInput === filters.search) return;
		const t = setTimeout(
			() => setFilters({ search: searchInput }),
			SEARCH_DEBOUNCE_MS,
		);
		return () => clearTimeout(t);
	}, [searchInput, filters.search, setFilters]);

	return (
		<div className="flex items-center gap-2">
			<div className="relative">
				<Input
					value={searchInput}
					onChange={(e) => setSearchInput(e.target.value)}
					placeholder="Search path or body"
					className="!h-7 !text-xs !min-w-0 pl-2 pr-7 w-52"
				/>
				<MagnifyingGlassIcon
					size={12}
					className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle pointer-events-none z-10"
				/>
			</div>

			<WorkbenchFilterSelect
				value={filters.method}
				options={filterMethods}
				onChange={(method) => setFilters({ method })}
				placeholder="All methods"
			/>

			<WorkbenchFilterSelect
				value={filters.status}
				options={filterStatuses}
				onChange={(status) => setFilters({ status })}
				placeholder="All statuses"
			/>
		</div>
	);
};
