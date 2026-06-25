import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useCustomerFilters } from "../../hooks/useCustomerFilters";
import {
	type FilterCheckboxOption,
	FilterCheckboxSubMenu,
	toggleFilterValue,
} from "./FilterCheckboxSubMenu";

const STATUS_OPTIONS: FilterCheckboxOption[] = [
	"active",
	"past_due",
	"canceled",
	"free_trial",
	"expired",
].map((value) => ({ value, label: keyToTitle(value) }));

export const FilterStatusSubMenu = ({
	onChange,
}: {
	onChange?: () => void;
}) => {
	const { queryStates, setFilters } = useCustomerFilters();
	const selected = queryStates.status || [];

	return (
		<FilterCheckboxSubMenu
			label="Status"
			options={STATUS_OPTIONS}
			selected={selected}
			onToggle={(value) => {
				setFilters({ status: toggleFilterValue(selected, value) });
				onChange?.();
			}}
		/>
	);
};
