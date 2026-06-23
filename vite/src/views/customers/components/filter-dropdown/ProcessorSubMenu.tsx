import { Checkbox } from "@autumn/ui";
import { CoinVerticalIcon, TriangleIcon } from "@phosphor-icons/react";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@autumn/ui";
import { RevenueCatIcon } from "@/components/v2/icons/AutumnIcons";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useCustomerFilters } from "../../hooks/useCustomerFilters";

type Processor = "stripe" | "revenuecat" | "vercel";

const PROCESSORS: { value: Processor; label: string; icon: React.ReactNode }[] =
	[
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
	const flags = useAutumnFlags();
	const { queryStates, setFilters } = useCustomerFilters();

	const visibleProcessors = PROCESSORS.filter(({ value }) => {
		if (value === "stripe") return true;
		if (value === "revenuecat") return flags.revenuecat;
		if (value === "vercel") return flags.vercel;
		return false;
	});

	const selectedProcessors = queryStates.processor || [];
	const hasSelections = selectedProcessors.length > 0;

	const toggleProcessor = (processor: Processor) => {
		const isSelected = selectedProcessors.includes(processor);
		const updated = isSelected
			? selectedProcessors.filter((p: string) => p !== processor)
			: [...selectedProcessors, processor];

		setFilters({ processor: updated });
		onChange?.();
	};

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
				Processors
				{hasSelections && (
					<span className="text-xs text-tertiary-foreground bg-muted px-1 py-0 rounded-md">
						{selectedProcessors.length}
					</span>
				)}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				{visibleProcessors.map(({ value, label, icon }) => {
					const isActive = selectedProcessors.includes(value);
					return (
						<DropdownMenuItem
							key={value}
							closeOnClick={false}
							onClick={(e) => {
								e.preventDefault();
								toggleProcessor(value);
							}}
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
