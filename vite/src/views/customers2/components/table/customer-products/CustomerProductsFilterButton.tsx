import { CustomerProductKind } from "@autumn/shared";
import { FilterButton } from "@/views/customers/components/filter-dropdown/FilterButton";
import { FilterRadioSubMenu } from "@/views/customers/components/filter-dropdown/FilterRadioSubMenu";
import type { CustomerProductsKindFilter } from "@/views/customers2/hooks/useCustomerProductsTableState";

const KIND_OPTIONS: { label: string; value: CustomerProductsKindFilter }[] = [
	{ label: "All types", value: "all" },
	{ label: "Subscriptions", value: CustomerProductKind.Subscription },
	{ label: "One-off", value: CustomerProductKind.OneOff },
	{ label: "Add-ons", value: CustomerProductKind.AddOn },
];

const STATUS_OPTIONS = [
	{ label: "Active", value: false },
	{ label: "Show expired", value: true },
];

export function CustomerProductsFilterButton({
	kind,
	setKind,
	showExpired,
	setShowExpired,
}: {
	kind: CustomerProductsKindFilter;
	setKind: (kind: CustomerProductsKindFilter) => void;
	showExpired: boolean;
	setShowExpired: (showExpired: boolean) => void;
}) {
	const kindLabel = KIND_OPTIONS.find((option) => option.value === kind)?.label;

	return (
		<FilterButton
			hasActiveFilters={kind !== "all" || showExpired}
			onClear={() => {
				setKind("all");
				setShowExpired(false);
			}}
		>
			<FilterRadioSubMenu
				label="Type"
				options={KIND_OPTIONS}
				value={kind}
				onChange={setKind}
				activeBadge={kind !== "all" ? kindLabel : undefined}
			/>
			<FilterRadioSubMenu
				label="Status"
				options={STATUS_OPTIONS}
				value={showExpired}
				onChange={setShowExpired}
				activeBadge={showExpired ? "Expired" : undefined}
			/>
		</FilterButton>
	);
}
