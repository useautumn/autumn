import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { CheckIcon } from "@phosphor-icons/react";
import { FilterTriggerButton } from "../FilterTriggerButton";
import { DEDUCTIONS_MODE, USAGE_MODE, useBreakdown } from "./useBreakdown";

const MEASURES = [
	{
		value: USAGE_MODE,
		label: "Usage",
		description: "What the customer tracked",
	},
	{
		value: DEDUCTIONS_MODE,
		label: "Deductions",
		description: "What each balance gave up",
	},
];

export const MeasureCell = () => {
	const { mode, changeMode } = useBreakdown();
	const current = MEASURES.find((measure) => measure.value === mode);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<FilterTriggerButton label="Measure" value={current?.label} />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-[220px]">
				{MEASURES.map((measure) => (
					<DropdownMenuItem
						key={measure.value}
						onClick={() => changeMode(measure.value)}
						className="justify-between"
					>
						<span className="flex flex-col">
							{measure.label}
							<span className="text-xs text-tertiary-foreground">
								{measure.description}
							</span>
						</span>
						{measure.value === mode && (
							<CheckIcon className="text-foreground" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
