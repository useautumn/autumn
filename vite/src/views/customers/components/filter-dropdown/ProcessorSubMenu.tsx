import { CoinVerticalIcon, TriangleIcon } from "@phosphor-icons/react";
import type React from "react";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { RevenueCatIcon } from "@/components/v2/icons/AutumnIcons";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useCustomerFilters } from "../../hooks/useCustomerFilters";

const PROCESSORS: { value: string; label: string; icon: React.ReactNode }[] = [
	{ value: "stripe", label: "Stripe", icon: <CoinVerticalIcon size={14} weight="fill" /> },
	{ value: "revenuecat", label: "RevenueCat", icon: <RevenueCatIcon size={14} /> },
	{ value: "vercel", label: "Vercel", icon: <TriangleIcon size={14} weight="fill" /> },
];

export const ProcessorSubMenu = () => {
	const { queryStates, setFilters } = useCustomerFilters();
	const flags = useAutumnFlags();

	const processors = PROCESSORS.filter(({ value }) => {
		if (value === "stripe") return true;
		if (value === "revenuecat") return flags.revenuecat;
		if (value === "vercel") return flags.vercel;
		return false;
	});

	const selectedProcessors = queryStates.processor || [];
	const hasSelections = selectedProcessors.length > 0;

	const toggleProcessor = (value: string) => {
		const isSelected = selectedProcessors.includes(value);
		const updated = isSelected
			? selectedProcessors.filter((p: string) => p !== value)
			: [...selectedProcessors, value];
		setFilters({ processor: updated });
	};

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
				Processors
				{hasSelections && (
					<span className="text-xs text-t3 bg-muted px-1 py-0 rounded-md">
						{selectedProcessors.length}
					</span>
				)}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				{processors.map(({ value, label, icon }) => {
					const isActive = selectedProcessors.includes(value);
					return (
						<DropdownMenuItem
							key={value}
							onClick={(e) => {
								e.preventDefault();
								toggleProcessor(value);
							}}
							onSelect={(e) => e.preventDefault()}
							className="flex items-center gap-2 cursor-pointer text-sm"
						>
							<Checkbox checked={isActive} className="border-border" />
							{icon}
							{label}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
};
