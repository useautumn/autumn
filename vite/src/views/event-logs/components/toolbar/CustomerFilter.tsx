import type { CustomerWithProducts } from "@autumn/shared";
import { useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { FilterTriggerButton } from "@/views/customers/customer/analytics/components/FilterTriggerButton";
import { useCusSearchQueryV2 } from "@/views/customers/hooks/useCusSearchQuery";
import { useLogsFilters } from "../../hooks/useLogsFilters";
import { ALL_OPTION_ID, type FilterOption, FilterSelect } from "./FilterSelect";

const SEARCH_PAGE_SIZE = 25;

const toCustomerOption = ({
	customer,
}: {
	customer: Pick<CustomerWithProducts, "id" | "internal_id" | "name" | "email">;
}): FilterOption => {
	const id = customer.id || customer.internal_id;
	return { id, name: customer.name || customer.email || id };
};

export const CustomerFilter = () => {
	const { filters, setFilters } = useLogsFilters();
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce({ value: search, delayMs: 300 });
	const { customers, isFetchingUncached } = useCusSearchQueryV2({
		search: debouncedSearch,
		page_size: SEARCH_PAGE_SIZE,
	});

	const selectedId = filters.customer_id;
	const searched = ((customers ?? []) as CustomerWithProducts[])
		.map((customer) => toCustomerOption({ customer }))
		.filter((option) => option.id !== selectedId);
	const options = [
		{ id: ALL_OPTION_ID, name: "All customers" },
		...(selectedId ? [{ id: selectedId, name: selectedId }] : []),
		...searched,
	];

	return (
		<FilterSelect
			value={selectedId ?? ALL_OPTION_ID}
			onValueChange={(value) =>
				setFilters({ customer_id: value === ALL_OPTION_ID ? null : value })
			}
			options={options}
			searchable
			shouldFilter={false}
			onSearchChange={setSearch}
			isLoading={isFetchingUncached}
			searchPlaceholder="Search by name, email or ID..."
			emptyText="No customers found"
			trigger={
				<FilterTriggerButton
					label="Customer"
					value={selectedId ?? "All customers"}
				/>
			}
		/>
	);
};
