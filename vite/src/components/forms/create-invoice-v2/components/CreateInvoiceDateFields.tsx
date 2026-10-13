import {
	Calendar,
	cn,
	FormLabel,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { ArrowRightIcon, CalendarBlankIcon } from "@phosphor-icons/react";
import { format, startOfToday } from "date-fns";
import { type ReactNode, useState } from "react";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { formatUtcDay } from "../utils/servicePeriod";
import { ServicePeriodPicker } from "./ServicePeriodPicker";

const DATE_FIELD_CLASS =
	"flex h-input w-full items-center gap-2 truncate rounded-lg px-2 text-left text-sm outline-none input-base input-shadow-default input-state-open";

function DateFieldButton({
	children,
	isEmpty,
	...props
}: React.ComponentProps<"button"> & { isEmpty?: boolean }) {
	return (
		<button
			type="button"
			{...props}
			className={cn(DATE_FIELD_CLASS, isEmpty && "text-tertiary-foreground")}
		>
			<CalendarBlankIcon
				size={14}
				className="shrink-0 text-tertiary-foreground"
			/>
			{children}
		</button>
	);
}

/** One day, defaulting to today; backdating is allowed, the future is not. */
export function CreateInvoiceIssueDateField() {
	const { form, formValues } = useCreateInvoiceFormContext();
	const [open, setOpen] = useState(false);
	const today = startOfToday();
	const issueDay = formValues.issueDay ? new Date(formValues.issueDay) : today;

	return (
		<div>
			<FormLabel>Issue date</FormLabel>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<DateFieldButton>{format(issueDay, "MMM d, yyyy")}</DateFieldButton>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto p-0">
					<Calendar
						mode="single"
						selected={issueDay}
						defaultMonth={issueDay}
						disabled={{ after: today }}
						onSelect={(day) => {
							if (!day) return;
							form.setFieldValue("issueDay", day.getTime());
							setOpen(false);
						}}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}

function ServicePeriodLabel({
	start,
	end,
}: {
	start: number;
	end: number;
}): ReactNode {
	return (
		<>
			<span>{formatUtcDay(start)}</span>
			<ArrowRightIcon size={12} className="shrink-0 text-tertiary-foreground" />
			<span>{formatUtcDay(end)}</span>
		</>
	);
}

/** The invoice's service period: printed under, and prorating, every plan line without its own. */
export function CreateInvoiceServicePeriodField() {
	const { form, formValues } = useCreateInvoiceFormContext();
	const [open, setOpen] = useState(false);
	const { periodStart, periodEnd } = formValues;
	const period =
		periodStart !== null && periodEnd !== null
			? { start: periodStart, end: periodEnd }
			: null;

	return (
		<div>
			<FormLabel>Service period</FormLabel>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<DateFieldButton isEmpty={!period}>
						{period ? (
							<ServicePeriodLabel start={period.start} end={period.end} />
						) : (
							"No service period"
						)}
					</DateFieldButton>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto">
					<ServicePeriodPicker
						value={period}
						onApply={(next) => {
							form.setFieldValue("periodStart", next?.start ?? null);
							form.setFieldValue("periodEnd", next?.end ?? null);
							setOpen(false);
						}}
					/>
				</PopoverContent>
			</Popover>
			<p className="mt-1.5 text-xs text-tertiary-foreground">
				Printed under every line. A plan can set its own from its ⋯ menu.
			</p>
		</div>
	);
}
