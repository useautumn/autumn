import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { cn } from "@/lib/utils";

const DAY_OPTIONS = [7, 30];

export function CustomerUsageAnalyticsSelectDays({
	selectedDays,
	setSelectedDays,
}: {
	selectedDays: number;
	setSelectedDays: (days: number) => void;
}) {
	const [open, setOpen] = useState(false);
	const displayText = `Last ${selectedDays} days`;

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="secondary"
					size="mini"
					className={cn("gap-1", open && "btn-secondary-active")}
				>
					{displayText}
					<CaretDownIcon className="size-3.5 text-t3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{DAY_OPTIONS.map((days) => {
					const isSelected = selectedDays === days;
					return (
						<DropdownMenuItem
							key={days}
							onClick={() => setSelectedDays(days)}
							className="flex gap-3"
						>
							<CheckIcon
								size={12}
								className={isSelected ? "opacity-100" : "opacity-0"}
							/>
							Last {days} days
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
