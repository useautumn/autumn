import { Check, ChevronDown } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { cn } from "@/lib/utils";

const DAY_OPTIONS = [7, 30];

export function CustomerUsageAnalyticsSelectDays({
	selectedDays,
	setSelectedDays,
}: {
	selectedDays: number;
	setSelectedDays: (days: number) => void;
}) {
	const displayText = `Last ${selectedDays} days`;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="secondary"
					role="combobox"
					size="mini"
					className="justify-between font-normal px-2! gap-3"
				>
					<span className="truncate">{displayText}</span>
					<ChevronDown className="h-4 w-4 shrink-0 text-t3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[180px] p-1" align="end">
				{DAY_OPTIONS.map((days) => {
					const isSelected = selectedDays === days;
					return (
						<div
							key={days}
							className={cn(
								"relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
								isSelected && "bg-accent/50",
							)}
							onClick={() => setSelectedDays(days)}
						>
							<Check
								className={cn(
									"mr-2 h-4 w-4",
									isSelected ? "opacity-100" : "opacity-0",
								)}
							/>
							<span>Last {days} days</span>
						</div>
					);
				})}
			</PopoverContent>
		</Popover>
	);
}
