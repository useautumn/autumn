import { ListMagnifyingGlassIcon } from "@phosphor-icons/react";
import { debounce } from "lodash";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { Input } from "@/components/v2/inputs/Input";
import { useCusSearchQuery } from "@/views/customers/hooks/useCusSearchQuery";
import { useCustomersQueryStates } from "@/views/customers/hooks/useCustomersQueryStates";

export function CustomerListSearchBar() {
	const { queryStates, setFilters } = useCustomersQueryStates();

	const { totalCount } = useCusSearchQuery();
	const navigate = useNavigate();
	const location = useLocation();

	const debouncedSearch = useMemo(
		() =>
			debounce(async (query: string) => {
				setFilters({ q: query });
			}, 350),
		[location.search, location.pathname, navigate, setFilters],
	);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const q = e.target.value;
		debouncedSearch(q);
	};

	return (
		<div className="relative flex items-center w-full max-w-xs">
			<ListMagnifyingGlassIcon
				size={16}
				className="text-t3 absolute left-2.5 pointer-events-none"
			/>
			<Input
				onChange={handleChange}
				className="!pl-8 text-sm w-sm"
				placeholder={`Search ${Intl.NumberFormat("en-US").format(totalCount)} customers`}
				defaultValue={queryStates.q}
			/>
		</div>
	);
}
