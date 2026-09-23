import {
	DateInputUnix,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { InfoIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { CalendarIcon } from "lucide-react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { CustomerStatePhasePlans } from "@/components/forms/customer-state/components/CustomerStatePhasePlans";
import {
	canCreateSchedulePhaseStartInPast,
	getPhaseTimingError,
	hasCreateSchedulePhaseStarted,
} from "@/components/forms/customer-state/customerStateSchema";
import { cn } from "@/lib/utils";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

const LOCKED_PHASE_MESSAGE = "This phase has passed and can't be edited.";
const CURRENT_PHASE_TIME_LOCKED_MESSAGE =
	"You can't edit the time of the current phase.";
const BACKDATE_START_YEAR_LOOKBACK = 25;

interface SchedulePhaseCardProps {
	phaseIndex: number;
	hasConnector: boolean;
}

export function SchedulePhaseCard({
	phaseIndex,
	hasConnector,
}: SchedulePhaseCardProps) {
	const { isExistingSchedule, allowFirstPhaseBackdate } =
		useCreateScheduleFormContext();
	const {
		form,
		formValues,
		nowMs,
		isPhaseLocked,
		handleInsertPhase,
		handleRemovePhase,
	} = useCustomerStateContext();

	const phase = formValues.phases[phaseIndex];
	if (!phase) return null;

	const isFirstPhase = phaseIndex === 0;
	const isLocked = isPhaseLocked({ phaseIndex });
	const hasStarted = hasCreateSchedulePhaseStarted({
		phases: formValues.phases,
		phaseIndex,
		nowMs,
	});
	const phaseTimingError = getPhaseTimingError({
		phases: formValues.phases,
		phaseIndex,
		nowMs,
	});
	const isDateLocked = hasStarted;
	const disablePastDates = !canCreateSchedulePhaseStartInPast({
		phases: formValues.phases,
		phaseIndex,
		nowMs,
	});

	const isNewFirstPhase = !isExistingSchedule && isFirstPhase;
	const nowChip = (
		<div className="flex h-input items-center gap-3 rounded-lg input-base input-shadow-default px-3 text-sm text-foreground">
			<CalendarIcon className="size-3.5 shrink-0 text-tertiary-foreground ml-1" />
			<span className="flex-1">Now</span>
			<Tooltip>
				<TooltipTrigger asChild>
					<InfoIcon
						size={13}
						className="shrink-0 text-subtle hover:text-muted-foreground transition-colors cursor-default"
					/>
				</TooltipTrigger>
				<TooltipContent>
					The first phase of a schedule starts immediately
				</TooltipContent>
			</Tooltip>
		</div>
	);

	const phaseHeader =
		isNewFirstPhase && !allowFirstPhaseBackdate ? (
			nowChip
		) : isNewFirstPhase ? (
			<div className="group/phase-date relative">
				<DateInputUnix
					unixDate={phase.startsAt}
					setUnixDate={(value) => {
						form.setFieldValue(`phases[${phaseIndex}].startsAt`, value);
					}}
					disableFutureDates
					maxUnixDate={nowMs}
					fromYear={
						new Date(nowMs).getFullYear() - BACKDATE_START_YEAR_LOOKBACK
					}
					placeholder="Now"
					withTime
					className="group-hover/phase-date:border-primary"
				/>
			</div>
		) : (
			<>
				<div className="group/phase-date relative">
					<DateInputUnix
						unixDate={phase.startsAt}
						setUnixDate={(value) => {
							form.setFieldValue(`phases[${phaseIndex}].startsAt`, value);
						}}
						disabled={isDateLocked}
						disablePastDates={disablePastDates}
						minUnixDate={disablePastDates ? nowMs : undefined}
						withTime
						className={cn(
							"group-hover/phase-date:border-primary",
							isDateLocked && "text-tertiary-foreground border-border/70",
							phaseTimingError && "border-destructive",
						)}
					/>
					{!isFirstPhase && (
						<button
							type="button"
							onClick={() => handleRemovePhase({ phaseIndex })}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-subtle hover:text-destructive transition-colors opacity-0 group-hover/phase-date:opacity-100 disabled:pointer-events-none disabled:opacity-50"
							disabled={hasStarted}
						>
							<TrashIcon size={13} />
						</button>
					)}
				</div>
				{phaseTimingError && (
					<p className="text-xs text-destructive mt-1 pl-1">
						{phaseTimingError}
					</p>
				)}
			</>
		);

	const phaseContent = (
		<div className={cn(isLocked && "opacity-75")}>
			{isDateLocked && !isLocked ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<div>{phaseHeader}</div>
					</TooltipTrigger>
					<TooltipContent>{CURRENT_PHASE_TIME_LOCKED_MESSAGE}</TooltipContent>
				</Tooltip>
			) : (
				phaseHeader
			)}

			<div
				className={cn(
					"relative mt-1.5 pl-[38px] group/connector",
					hasConnector && "-mb-4 pb-6",
				)}
			>
				<div className="absolute left-[19px] top-0 bottom-0 w-px bg-border/50" />
				{hasConnector && !isLocked && (
					<button
						type="button"
						onClick={() => handleInsertPhase({ afterIndex: phaseIndex })}
						className="absolute left-[12px] bottom-2 z-10 size-[15px] rounded-full bg-card border border-border/60 text-subtle hover:text-foreground hover:border-primary hover:bg-card flex items-center justify-center opacity-0 group-hover/connector:opacity-100 transition-all duration-150"
					>
						<PlusIcon size={9} weight="bold" />
					</button>
				)}
				<CustomerStatePhasePlans phaseIndex={phaseIndex} />
			</div>
		</div>
	);

	return isLocked ? (
		<Tooltip>
			<TooltipTrigger asChild>
				<div>{phaseContent}</div>
			</TooltipTrigger>
			<TooltipContent>{LOCKED_PHASE_MESSAGE}</TooltipContent>
		</Tooltip>
	) : (
		phaseContent
	);
}
