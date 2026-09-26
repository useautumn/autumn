import { CoinVerticalIcon, TriangleIcon } from "@phosphor-icons/react";
import { RevenueCatIcon } from "@/components/v2/icons/AutumnIcons";
import { useOrg } from "@/hooks/common/useOrg";
import { useCustomerFilters } from "../../hooks/useCustomerFilters";
import {
	type FilterCheckboxOption,
	FilterCheckboxSubMenu,
	toggleFilterValue,
} from "./FilterCheckboxSubMenu";

const PROCESSOR_OPTIONS: FilterCheckboxOption[] = [
	{
		value: "stripe",
		label: "Stripe",
		icon: <CoinVerticalIcon size={14} weight="fill" />,
	},
	{
		value: "revenuecat",
		label: "RevenueCat",
		icon: <RevenueCatIcon size={14} />,
	},
	{
		value: "vercel",
		label: "Vercel",
		icon: <TriangleIcon size={14} weight="fill" />,
	},
];

export const ProcessorSubMenu = ({ onChange }: { onChange?: () => void }) => {
	const { org } = useOrg();
	const processorConfigs = org?.processor_configs;
	const { queryStates, setFilters } = useCustomerFilters();
	const selected = queryStates.processor || [];

	const visibleOptions = PROCESSOR_OPTIONS.filter(({ value }) => {
		if (value === "stripe") return true;
		if (value === "revenuecat") return !!processorConfigs?.revenuecat.connected;
		if (value === "vercel") return !!processorConfigs?.vercel.connected;
		return false;
	});

	return (
		<FilterCheckboxSubMenu
			label="Processors"
			options={visibleOptions}
			selected={selected}
			onToggle={(value) => {
				setFilters({ processor: toggleFilterValue(selected, value) });
				onChange?.();
			}}
		/>
	);
};
