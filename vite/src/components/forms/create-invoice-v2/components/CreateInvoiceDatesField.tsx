import {
	Calendar,
	cn,
	FormLabel,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { XIcon } from "@phosphor-icons/react";
import { format, isAfter, startOfToday } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";

const RANGE_DATE_FORMAT = "MMM d, yyyy";

export function CreateInvoiceDatesField() {
	const { form, formValues } = useCreateInvoiceFormContext();
	const { issueDay, dueDay } = formValues;
	const [open, setOpen] = useState(false);
	const [pendingIssueDay, setPendingIssueDay] = useState<Date | null>(null);
	const today = startOfToday();

	const selectedRange =
		issueDay !== null && dueDay !== null
			? { from: new Date(issueDay), to: new Date(dueDay) }
			: undefined;

	const setDays = ({
		issue,
		due,
	}: {
		issue: Date | null;
		due: Date | null;
	}) => {
		form.setFieldValue("issueDay", issue?.getTime() ?? null);
		form.setFieldValue("dueDay", due?.getTime() ?? null);
	};

	const displayedRange: DateRange | undefined = pendingIssueDay
		? { from: pendingIssueDay, to: undefined }
		: selectedRange;

	const handleOpenChange = (nextOpen: boolean) => {
		setPendingIssueDay(null);
		setOpen(nextOpen);
	};

	const handleSelect = (_range: DateRange | undefined, clickedDay: Date) => {
		const isFutureDay = isAfter(clickedDay, today);
		if (!isFutureDay) {
			setPendingIssueDay(clickedDay);
			return;
		}
		if (!pendingIssueDay) return;

		setDays({ issue: pendingIssueDay, due: clickedDay });
		handleOpenChange(false);
	};

	return (
		<div>
			<FormLabel>Invoice dates</FormLabel>
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
								`Issued ${format(selectedRange.from, RANGE_DATE_FORMAT)} → Due ${format(selectedRange.to, RANGE_DATE_FORMAT)}`
							) : (
								<span>Select issue and due dates</span>
							)}
						</button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-auto p-0">
						<div className="border-b px-3 py-2 text-xs text-tertiary-foreground">
							{pendingIssueDay
								? "Select the due date"
								: "Select the issue date"}
						</div>
						<Calendar
							mode="range"
							numberOfMonths={2}
							selected={displayedRange}
							onSelect={handleSelect}
							defaultMonth={displayedRange?.from}
							disabled={
								pendingIssueDay ? { before: pendingIssueDay } : { after: today }
							}
						/>
					</PopoverContent>
				</Popover>
				{selectedRange && (
					<button
						type="button"
						aria-label="Clear invoice dates"
						className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-tertiary-foreground transition-colors hover:text-foreground"
						onClick={() => setDays({ issue: null, due: null })}
					>
						<XIcon className="size-3.5" />
					</button>
				)}
			</div>
		</div>
	);
}
