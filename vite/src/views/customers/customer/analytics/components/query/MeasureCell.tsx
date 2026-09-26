import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { Check } from "lucide-react";
import { StripCell } from "./StripCell";
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

export const MeasureCell = ({ className }: { className?: string }) => {
	const { mode, changeMode } = useBreakdown();
	const current = MEASURES.find((measure) => measure.value === mode);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<StripCell
					label="Measure"
					value={current?.label}
					className={className}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-[220px]">
				{MEASURES.map((measure) => (
					<DropdownMenuItem
						key={measure.value}
						onClick={() => changeMode(measure.value)}
						className="flex items-center justify-between gap-2"
					>
						<span className="flex flex-col">
							<span className="text-xs">{measure.label}</span>
							<span className="text-[11px] text-subtle">
								{measure.description}
							</span>
						</span>
						{measure.value === mode && (
							<Check className="h-3 w-3 shrink-0 text-tertiary-foreground" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
