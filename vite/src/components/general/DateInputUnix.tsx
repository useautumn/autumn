import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const DateInputUnix = ({
	unixDate,
	setUnixDate,
	disabled,
}: {
	unixDate: number | null;
	setUnixDate: (unixDate: number | null) => void;
	disabled?: boolean;
}) => {
	const [popoverOpen, setPopoverOpen] = useState(false);
	return (
		<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					data-state={popoverOpen ? "open" : "closed"}
					disabled={disabled}
					className={cn(
						// Match Select component styling
						"w-full rounded-lg flex items-center justify-start gap-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50",
						"h-input input-base input-shadow-default input-state-open",
						// Placeholder styling
						!unixDate && "text-muted-foreground",
					)}
				>
					<CalendarIcon className="size-4 shrink-0" />
					{unixDate ? (
						format(new Date(unixDate), "PPP")
					) : (
						<span>Pick a date</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-full p-0">
				<Calendar
					mode="single"
					selected={unixDate ? new Date(unixDate) : undefined}
					onSelect={(date) => {
						setUnixDate(date?.getTime() || null);
						setPopoverOpen(false);
					}}
					initialFocus
				/>
			</PopoverContent>
		</Popover>
	);
};
