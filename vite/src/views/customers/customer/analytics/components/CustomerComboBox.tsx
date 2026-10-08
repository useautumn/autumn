import type { CustomerWithProducts } from "@autumn/shared";
import { SearchableSelect } from "@autumn/ui";
import { type ReactNode, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useCusSearchQueryV2 } from "@/views/customers/hooks/useCusSearchQuery";
import { useAnalyticsContext } from "../AnalyticsContext";
import { useAnalyticsFilterState } from "../hooks/useAnalyticsFilterState";
import { SelectOptionLabel } from "./SelectOptionLabel";

const ALL_CUSTOMERS = "__all_customers__";
const SEARCH_PAGE_SIZE = 25;

type CustomerOption = {
	id: string;
	name: string;
	secondary: string | null;
};

const toCustomerOption = ({
	customer,
}: {
	customer: Pick<CustomerWithProducts, "id" | "internal_id" | "name" | "email">;
}): CustomerOption => {
	const id = customer.id || customer.internal_id;
	return {
		id,
		name: customer.name || customer.email || id,
		secondary: customer.name && customer.email ? customer.email : id,
	};
};

const ALL_CUSTOMERS_OPTION: CustomerOption = {
	id: ALL_CUSTOMERS,
	name: "All customers",
	secondary: null,
};

export function CustomerComboBox({
	renderTrigger,
}: {
	/** Draws the button that opens the picker, given the chosen customer's name. */
	renderTrigger: (label: string) => ReactNode;
}) {
	const { customer } = useAnalyticsContext();
	const { setFilterStates } = useAnalyticsFilterState();
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce({ value: search, delayMs: 300 });

	const { customers, isFetchingUncached } = useCusSearchQueryV2({
		search: debouncedSearch,
		page_size: SEARCH_PAGE_SIZE,
	});

	const selectedOption = customer ? toCustomerOption({ customer }) : null;
	const searchedOptions = ((customers ?? []) as CustomerWithProducts[])
		.map((result) => toCustomerOption({ customer: result }))
		.filter((option) => option.id !== selectedOption?.id);
	const options = [
		ALL_CUSTOMERS_OPTION,
		...(selectedOption ? [selectedOption] : []),
		...searchedOptions,
	];

	const selectCustomer = (value: string) =>
		setFilterStates({
			customer_id: value === ALL_CUSTOMERS ? null : value,
			entity_id: null,
		});

	return (
		<SearchableSelect<CustomerOption>
			value={selectedOption?.id ?? ALL_CUSTOMERS}
			onValueChange={selectCustomer}
			options={options}
			getOptionValue={(option) => option.id}
			getOptionLabel={(option) => option.name}
			searchable
			searchPlaceholder="Search by name, email or ID..."
			onSearchChange={setSearch}
			isLoading={isFetchingUncached}
			emptyText="No customers found"
			trigger={renderTrigger(selectedOption?.name ?? "All customers")}
			contentClassName="min-w-[280px] rounded-xl"
			renderOption={(option, isSelected) => (
				<SelectOptionLabel
					name={option.name}
					secondary={option.secondary}
					isSelected={isSelected}
				/>
			)}
		/>
	);
}
