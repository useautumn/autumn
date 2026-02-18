import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { useRef, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TimePickerInput } from "./TimePickerInput";
import {
	display12HourValue,
	type Period,
	setDateByType,
} from "./timePickerUtils";

function TimePicker({
	date,
	setDate,
	use24Hour,
}: {
	date: Date | undefined;
	setDate: (date: Date | undefined) => void;
	use24Hour?: boolean;
}) {
	const hourRef = useRef<HTMLInputElement>(null);
	const minuteRef = useRef<HTMLInputElement>(null);

	const period: Period = date && date.getHours() >= 12 ? "PM" : "AM";

	const togglePeriod = () => {
		if (!date) return;
		const newPeriod: Period = period === "AM" ? "PM" : "AM";
		const tempDate = new Date(date);
		const hours = display12HourValue(date.getHours());
		setDate(
			setDateByType({
				date: tempDate,
				value: hours.toString(),
				type: "12hours",
				period: newPeriod,
			}),
		);
	};

	return (
		<div className="border-t px-3 py-3">
			<div className="flex items-center rounded-lg h-input input-base input-shadow-default input-state-focus-within px-2 bg-popover">
				<Clock className="size-3.5 shrink-0 text-t3 mr-1" />
				<TimePickerInput
					picker={use24Hour ? "hours" : "12hours"}
					period={use24Hour ? undefined : period}
					date={date}
					setDate={setDate}
					ref={hourRef}
					onRightFocus={() => minuteRef.current?.focus()}
				/>
				<span className="text-xs text-t3 select-none">:</span>
				<TimePickerInput
					picker="minutes"
					date={date}
					setDate={setDate}
					ref={minuteRef}
					onLeftFocus={() => hourRef.current?.focus()}
				/>
				{!use24Hour && (
					<>
						<div className="border-l h-4 mx-1.5" />
						<button
							type="button"
							onClick={togglePeriod}
							className="rounded-sm px-1.5 py-0.5 text-xs font-medium text-t2 transition-none hover:bg-accent select-none"
						>
							{period}
						</button>
					</>
				)}
			</div>
		</div>
	);
}

export const DateInputUnix = ({
	unixDate,
	setUnixDate,
	disabled,
	withTime,
	use24Hour,
}: {
	unixDate: number | null;
	setUnixDate: (unixDate: number | null) => void;
	disabled?: boolean;
	withTime?: boolean;
	/** Show 24-hour clock (00–23) instead of 12-hour with AM/PM. */
	use24Hour?: boolean;
}) => {
	const [popoverOpen, setPopoverOpen] = useState(false);

	const displayFormat = !withTime
		? "EEEE, MMMM do yyyy"
		: use24Hour
			? "EEEE, MMMM do yyyy 'at' HH:mm"
			: "EEEE, MMMM do yyyy 'at' h:mm a";

	const dateObj = unixDate ? new Date(unixDate) : undefined;

	/** Carry over the current time when the user picks a new day. */
	const handleDaySelect = (newDay: Date | undefined) => {
		if (!newDay) {
			setUnixDate(null);
			return;
		}

		if (!withTime) {
			setUnixDate(newDay.getTime());
			setPopoverOpen(false);
			return;
		}

		if (!dateObj) {
			// First selection – default to noon.
			newDay.setHours(12, 0, 0, 0);
			setUnixDate(newDay.getTime());
			return;
		}

		// Preserve the current time on the newly selected day.
		const newDateFull = new Date(dateObj);
		newDateFull.setFullYear(
			newDay.getFullYear(),
			newDay.getMonth(),
			newDay.getDate(),
		);
		setUnixDate(newDateFull.getTime());
	};

	const handleTimeChange = (newDate: Date | undefined) => {
		if (!newDate) return;
		setUnixDate(newDate.getTime());
	};

	return (
		<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					data-state={popoverOpen ? "open" : "closed"}
					disabled={disabled}
					className={cn(
						"w-full rounded-lg flex items-center justify-start gap-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50",
						"h-input input-base input-shadow-default input-state-open truncate",
						!unixDate && "text-muted-foreground",
					)}
				>
					<CalendarIcon className="size-3.5 shrink-0 text-t3 ml-1" />
					{unixDate ? (
						format(new Date(unixDate), displayFormat)
					) : (
						<span>Pick a date{withTime ? " and time" : ""}</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0">
				<Calendar
					mode="single"
					selected={dateObj}
					onSelect={handleDaySelect}
					initialFocus
				/>
				{withTime && (
					<TimePicker
						date={dateObj}
						setDate={handleTimeChange}
						use24Hour={use24Hour}
					/>
				)}
			</PopoverContent>
		</Popover>
	);
};
