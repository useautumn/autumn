import { ConditionalTooltip, DateInputUnix } from "@autumn/ui";
import { format, subYears } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { cn } from "@/lib/utils";
import { useCreateScheduleFormContext } from "../../context/CreateScheduleFormProvider";
import {
	formatPhaseDate,
	isImmediatePhase,
} from "../../utils/review/phaseTiming";

const CURRENT_PHASE_TIME_LOCKED_MESSAGE =
	"You can't edit the time of the current phase.";
const BACKDATE_START_YEAR_LOOKBACK = 25;

type PickerLimits = Pick<
	ComponentProps<typeof DateInputUnix>,
	| "disabled"
	| "disablePastDates"
	| "disableFutureDates"
	| "minUnixDate"
	| "maxUnixDate"
	| "fromYear"
>;

function PhaseDateBox({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<span
			className={cn(
				"flex h-7 items-center gap-2 rounded-md border border-table-surface-border bg-table-surface px-2 text-sm text-foreground transition-colors",
				className,
			)}
		>
			<CalendarIcon className="size-3.5 shrink-0 text-tertiary-foreground" />
			{children}
		</span>
	);
}

function PhaseDateLabel({
	startsAt,
	emptyLabel,
	emptyDetail,
}: {
	startsAt: number | null;
	emptyLabel: string;
	emptyDetail?: string;
}) {
	const detail = startsAt === null ? emptyDetail : format(startsAt, "h:mm a");

	return (
		<>
			<span>
				{startsAt === null ? emptyLabel : formatPhaseDate({ startsAt })}
			</span>
			{detail && (
				<span className="text-xs text-tertiary-foreground">{detail}</span>
			)}
		</>
	);
}

/**
 * The picker's own trigger is stretched invisibly over the compact label, so the
 * calendar and time popover are reused as-is.
 */
function PhaseDatePicker({
	startsAt,
	label,
	limits,
	hasTimingError,
	onChange,
}: {
	startsAt: number | null;
	label: ReactNode;
	limits: PickerLimits;
	hasTimingError: boolean;
	onChange: (startsAt: number | null) => void;
}) {
	return (
		<div className="group/phase-date relative w-fit">
			<PhaseDateBox
				className={cn(
					"group-hover/phase-date:border-foreground group-has-[:focus-visible]/phase-date:border-foreground",
					limits.disabled &&
						"text-tertiary-foreground group-hover/phase-date:border-table-surface-border",
					hasTimingError && "border-destructive",
				)}
			>
				{label}
			</PhaseDateBox>
			<DateInputUnix
				{...limits}
				unixDate={startsAt}
				setUnixDate={onChange}
				withTime
				className="absolute inset-0 h-full cursor-pointer opacity-0 disabled:cursor-not-allowed disabled:opacity-0"
			/>
		</div>
	);
}

export function PhaseDateControl({
	phaseIndex,
	hasStarted,
	isLocked,
	hasTimingError,
}: {
	phaseIndex: number;
	hasStarted: boolean;
	isLocked: boolean;
	hasTimingError: boolean;
}) {
	const { isExistingSchedule, allowFirstPhaseBackdate } =
		useCreateScheduleFormContext();
	const { form, formValues, nowMs } = useCustomerStateContext();

	const phase = formValues.phases[phaseIndex];
	if (!phase) return null;

	const isFirstPhase = isImmediatePhase({ phaseIndex });
	const isNewFirstPhase = !isExistingSchedule && isFirstPhase;
	const dateLabel = (startsAt: number | null) => (
		<PhaseDateLabel
			startsAt={startsAt}
			emptyLabel={isFirstPhase ? "Now" : "Pick a date"}
			emptyDetail={isFirstPhase ? "Starts immediately" : undefined}
		/>
	);

	if (isNewFirstPhase && !allowFirstPhaseBackdate) {
		return <PhaseDateBox>{dateLabel(null)}</PhaseDateBox>;
	}

	const disablePastDates = !hasStarted;
	const limits: PickerLimits = isNewFirstPhase
		? {
				disableFutureDates: true,
				maxUnixDate: nowMs,
				fromYear: subYears(nowMs, BACKDATE_START_YEAR_LOOKBACK).getFullYear(),
			}
		: {
				disabled: hasStarted,
				disablePastDates,
				minUnixDate: disablePastDates ? nowMs : undefined,
			};

	return (
		<ConditionalTooltip
			enabled={hasStarted && !isLocked}
			content={CURRENT_PHASE_TIME_LOCKED_MESSAGE}
		>
			<div className="w-fit">
				<PhaseDatePicker
					startsAt={phase.startsAt}
					label={dateLabel(phase.startsAt)}
					limits={limits}
					hasTimingError={hasTimingError}
					onChange={(startsAt) =>
						form.setFieldValue(`phases[${phaseIndex}].startsAt`, startsAt)
					}
				/>
			</div>
		</ConditionalTooltip>
	);
}
