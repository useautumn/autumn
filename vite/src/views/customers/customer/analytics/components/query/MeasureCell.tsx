import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { CheckIcon } from "@phosphor-icons/react";
import { FilterTriggerButton } from "../FilterTriggerButton";
import {
	COUNT_MODE,
	DEDUCTIONS_MODE,
	USAGE_MODE,
	useBreakdown,
} from "./useBreakdown";

const MEASURES = [
	{
		value: USAGE_MODE,
		label: "Usage",
		description: "Sum of tracked values",
	},
	{
		value: COUNT_MODE,
		label: "Count",
		description: "Number of events tracked",
	},
	{
		value: DEDUCTIONS_MODE,
		label: "Deductions",
		description: "What each balance gave up",
	},
];

export const MeasureCell = () => {
	const { mode, changeMode, customerId } = useBreakdown();
	// Deductions are tracked per customer, so they need one picked.
	const measures = customerId
		? MEASURES
		: MEASURES.filter((measure) => measure.value !== DEDUCTIONS_MODE);
	const current = measures.find((measure) => measure.value === mode);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<FilterTriggerButton label="Measure" value={current?.label} />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-[220px]">
				{measures.map((measure) => (
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
