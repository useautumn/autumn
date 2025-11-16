import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
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
				<Button
					variant={"secondary"}
					className={cn(
						"w-full justify-start text-left font-normal",
						!unixDate && "text-muted-foreground",
						// Add a border on active...
						popoverOpen &&
							"transition-colors duration-100 focus-visible:outline-none focus-visible:ring-0 border-[rgb(139,92,246)] shadow-[0_0_2px_1px_rgba(139,92,246,0.25)]",
					)}
					disabled={disabled}
				>
					<CalendarIcon className="mr-2 h-4 w-4" />
					{unixDate ? (
						format(new Date(unixDate), "PPP")
					) : (
						<span>Pick a date</span>
					)}
				</Button>
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
