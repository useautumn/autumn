import { CustomerProductKind } from "@autumn/shared";
import { FilterButton } from "@/views/customers/components/filter-dropdown/FilterButton";
import {
	type FilterCheckboxOption,
	FilterCheckboxSubMenu,
	toggleFilterValue,
} from "@/views/customers/components/filter-dropdown/FilterCheckboxSubMenu";
import { FilterRadioSubMenu } from "@/views/customers/components/filter-dropdown/FilterRadioSubMenu";
import {
	type CustomerProductsKindFilter,
	type CustomerProductsStatusOption,
	DEFAULT_PRODUCT_STATUSES,
	isDefaultProductStatuses,
} from "@/views/customers2/hooks/useCustomerProductsTableState";

const KIND_OPTIONS: { label: string; value: CustomerProductsKindFilter }[] = [
	{ label: "All types", value: "all" },
	{ label: "Subscriptions", value: CustomerProductKind.Subscription },
	{ label: "One-off", value: CustomerProductKind.OneOff },
	{ label: "Add-ons", value: CustomerProductKind.AddOn },
];

const STATUS_OPTIONS: FilterCheckboxOption[] = [
	{ label: "Active", value: "active" },
	{ label: "Expired", value: "expired" },
];

export function CustomerProductsFilterButton({
	kind,
	setKind,
	statuses,
	setStatuses,
}: {
	kind: CustomerProductsKindFilter;
	setKind: (kind: CustomerProductsKindFilter) => void;
	statuses: CustomerProductsStatusOption[];
	setStatuses: (statuses: CustomerProductsStatusOption[]) => void;
}) {
	const kindLabel = KIND_OPTIONS.find((option) => option.value === kind)?.label;

	return (
		<FilterButton
			hasActiveFilters={kind !== "all" || !isDefaultProductStatuses(statuses)}
			onClear={() => {
				setKind("all");
				setStatuses(DEFAULT_PRODUCT_STATUSES);
			}}
		>
			<FilterRadioSubMenu
				label="Type"
				options={KIND_OPTIONS}
				value={kind}
				onChange={setKind}
				activeBadge={kind !== "all" ? kindLabel : undefined}
			/>
			<FilterCheckboxSubMenu
				label="Status"
				options={STATUS_OPTIONS}
				selected={statuses}
				onToggle={(value) =>
					setStatuses(
						toggleFilterValue(
							statuses,
							value,
						) as CustomerProductsStatusOption[],
					)
				}
			/>
		</FilterButton>
	);
}
