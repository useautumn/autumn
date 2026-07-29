import { FilterButton } from "@/views/customers/components/filter-dropdown/FilterButton";
import { FilterRadioSubMenu } from "@/views/customers/components/filter-dropdown/FilterRadioSubMenu";
import { useProductsQueryState } from "@/views/products/hooks/useProductsQueryState";

const STATUS_OPTIONS = [
	{ label: "Active", value: false },
	{ label: "Show archived plans", value: true },
];

export function ProductListFilterButton() {
	const { queryStates, setQueryStates } = useProductsQueryState();
	const showArchived = queryStates.showArchivedProducts;

	const setShowArchived = (value: boolean) =>
		setQueryStates({ ...queryStates, showArchivedProducts: value });

	return (
		<FilterButton
			hasActiveFilters={showArchived}
			onClear={() => setShowArchived(false)}
		>
			<FilterRadioSubMenu
				label="Status"
				options={STATUS_OPTIONS}
				value={showArchived}
				onChange={setShowArchived}
				activeBadge={showArchived ? "Archived" : undefined}
			/>
		</FilterButton>
	);
}
