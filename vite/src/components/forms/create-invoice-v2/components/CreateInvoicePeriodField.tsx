import {
	Calendar,
	cn,
	FormLabel,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { XIcon } from "@phosphor-icons/react";
import { endOfDay, format, startOfDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";

const RANGE_DATE_FORMAT = "MMM d, yyyy";

export function CreateInvoicePeriodField() {
	const { form, formValues } = useCreateInvoiceFormContext();
	const { periodStart, periodEnd } = formValues;
	const [open, setOpen] = useState(false);
	const [pendingStart, setPendingStart] = useState<Date | null>(null);

	const selectedRange =
		periodStart !== null && periodEnd !== null
			? { from: new Date(periodStart), to: new Date(periodEnd) }
			: undefined;

	const setPeriod = ({
		start,
		end,
	}: {
		start: number | null;
		end: number | null;
	}) => {
		form.setFieldValue("periodStart", start);
		form.setFieldValue("periodEnd", end);
	};

	const displayedRange: DateRange | undefined = pendingStart
		? { from: pendingStart, to: undefined }
		: selectedRange;

	const handleOpenChange = (nextOpen: boolean) => {
		setPendingStart(null);
		setOpen(nextOpen);
	};

	const handleSelect = (_range: DateRange | undefined, clickedDay: Date) => {
		if (!pendingStart || clickedDay < pendingStart) {
			setPendingStart(clickedDay);
			return;
		}

		setPeriod({
			start: startOfDay(pendingStart).getTime(),
			end: endOfDay(clickedDay).getTime(),
		});
		handleOpenChange(false);
	};

	return (
		<div>
			<FormLabel>Start and end dates</FormLabel>
			<div className="relative">
				<Popover open={open} onOpenChange={handleOpenChange}>
					<PopoverTrigger asChild>
						<button
							type="button"
							data-state={open ? "open" : "closed"}
							className={cn(
								"w-full rounded-lg flex items-center justify-start gap-3 text-sm outline-none",
								"h-input input-base input-shadow-default input-state-open truncate",
								selectedRange ? "pr-9" : "text-muted-foreground",
							)}
						>
							<CalendarIcon className="size-3.5 shrink-0 text-tertiary-foreground ml-1" />
							{selectedRange ? (
								`${format(selectedRange.from, RANGE_DATE_FORMAT)} → ${format(selectedRange.to, RANGE_DATE_FORMAT)}`
							) : (
								<span>Select start and end dates</span>
							)}
						</button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-auto p-0">
						<Calendar
							mode="range"
							numberOfMonths={2}
							selected={displayedRange}
							onSelect={handleSelect}
							defaultMonth={displayedRange?.from}
						/>
					</PopoverContent>
				</Popover>
				{selectedRange && (
					<button
						type="button"
						aria-label="Clear start and end dates"
						className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-tertiary-foreground transition-colors hover:text-foreground"
						onClick={() => setPeriod({ start: null, end: null })}
					>
						<XIcon className="size-3.5" />
					</button>
				)}
			</div>
		</div>
	);
}
