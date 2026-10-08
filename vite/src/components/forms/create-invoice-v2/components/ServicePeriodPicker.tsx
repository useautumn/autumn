import { Button, Calendar, cn } from "@autumn/ui";
import { useState } from "react";
import type { ServicePeriod } from "../createInvoiceFormSchema";
import {
	calendarDayToUtcDay,
	formatUtcDay,
	utcDayToCalendarDay,
} from "../utils/servicePeriod";

type DraftPeriod = { start: number | null; end: number | null };

function PeriodBoundField({
	label,
	value,
	isNext,
}: {
	label: string;
	value: number | null;
	isNext: boolean;
}) {
	return (
		<div className="min-w-0 flex-1">
			<p className="mb-1 text-xs text-tertiary-foreground">{label}</p>
			<div
				className={cn(
					"flex h-input items-center rounded-lg px-2 text-sm input-base input-shadow-default",
					isNext && "ring-1 ring-primary/40",
					value === null && "text-tertiary-foreground",
				)}
			>
				{value === null ? "Pick a day" : formatUtcDay(value)}
			</div>
		</div>
	);
}

/** Start/End, a range calendar, then Clear or Apply. The first click picks the start, the next the end. */
export function ServicePeriodPicker({
	value,
	showTitle = true,
	onApply,
}: {
	value: ServicePeriod | null;
	showTitle?: boolean;
	onApply: (period: ServicePeriod | null) => void;
}) {
	const [draft, setDraft] = useState<DraftPeriod>({
		start: value?.start ?? null,
		end: value?.end ?? null,
	});
	const pickingEnd = draft.start !== null && draft.end === null;

	const handleDayClick = (day: Date) => {
		const picked = calendarDayToUtcDay(day);
		if (pickingEnd && draft.start !== null && picked > draft.start) {
			setDraft({ start: draft.start, end: picked });
			return;
		}
		setDraft({ start: picked, end: null });
	};

	const from =
		draft.start === null ? undefined : utcDayToCalendarDay(draft.start);
	const to = draft.end === null ? undefined : utcDayToCalendarDay(draft.end);
	const period =
		draft.start !== null && draft.end !== null
			? { start: draft.start, end: draft.end }
			: null;

	return (
		<div className="flex flex-col gap-3">
			{showTitle && (
				<p className="text-sm font-medium text-foreground">Service period</p>
			)}
			<div className="flex gap-2">
				<PeriodBoundField
					label="Start"
					value={draft.start}
					isNext={!pickingEnd}
				/>
				<PeriodBoundField label="End" value={draft.end} isNext={pickingEnd} />
			</div>
			<Calendar
				mode="range"
				className="p-0 [&_td>button]:w-full [&_td]:flex-1 [&_th]:flex-1"
				classNames={{ months: "flex", month: "flex w-full flex-col gap-4" }}
				selected={from ? { from, to } : undefined}
				defaultMonth={from}
				onSelect={(_range, day) => handleDayClick(day)}
			/>
			<div className="flex justify-end gap-2 border-t border-border/50 pt-3">
				<Button size="sm" variant="secondary" onClick={() => onApply(null)}>
					Clear
				</Button>
				<Button
					size="sm"
					variant="primary"
					disabled={!period}
					onClick={() => period && onApply(period)}
				>
					Apply
				</Button>
			</div>
		</div>
	);
}
