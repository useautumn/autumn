import { BillingInterval } from "@autumn/shared";
import { useCustomerFilters } from "../../hooks/useCustomerFilters";
import {
	type FilterCheckboxOption,
	FilterCheckboxSubMenu,
	toggleFilterValue,
} from "./FilterCheckboxSubMenu";

const INTERVAL_OPTIONS: FilterCheckboxOption[] = [
	{ value: BillingInterval.Week, label: "Weekly" },
	{ value: BillingInterval.Month, label: "Monthly" },
	{ value: BillingInterval.Quarter, label: "Quarterly" },
	{ value: BillingInterval.SemiAnnual, label: "Semi-annual" },
	{ value: BillingInterval.Year, label: "Yearly" },
];

export const IntervalSubMenu = ({ onChange }: { onChange?: () => void }) => {
	const { queryStates, setFilters } = useCustomerFilters();
	const selected = queryStates.interval || [];

	return (
		<FilterCheckboxSubMenu
			label="Interval"
			options={INTERVAL_OPTIONS}
			selected={selected}
			onToggle={(value) => {
				setFilters({ interval: toggleFilterValue(selected, value) });
				onChange?.();
			}}
		/>
	);
};
