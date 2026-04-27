import { InfoIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { CalendarIcon } from "lucide-react";
import { DateInputUnix } from "@/components/general/DateInputUnix";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import {
	canCreateSchedulePhaseStartInPast,
	getPhaseTimingError,
	hasCreateSchedulePhaseStarted,
} from "../createScheduleFormSchema";
import { getUsedGroupKeys } from "../scheduleUtils";
import { SchedulePlanRow } from "./SchedulePlanRow";

const LOCKED_PHASE_MESSAGE = "This phase has passed and can't be edited.";
const CURRENT_PHASE_TIME_LOCKED_MESSAGE =
	"You can't edit the time of the current phase.";

interface SchedulePhaseCardProps {
	phaseIndex: number;
	hasConnector: boolean;
}

export function SchedulePhaseCard({
	phaseIndex,
	hasConnector,
}: SchedulePhaseCardProps) {
	const {
		form,
		formValues,
		nowMs,
		products,
		isExistingSchedule,
		isPhaseLocked,
		handleAddPlan,
		handleInsertPhase,
		handleRemovePhase,
	} = useCreateScheduleFormContext();

	const phase = formValues.phases[phaseIndex];
	if (!phase) return null;

	const isFirstPhase = phaseIndex === 0;
	const isLocked = isPhaseLocked({ phaseIndex });
	const hasStarted = hasCreateSchedulePhaseStarted({
		phases: formValues.phases,
		phaseIndex,
		nowMs,
	});
	const activeProducts = products.filter((p) => !p.archived);
	const usedKeys = getUsedGroupKeys({ plans: phase.plans, products });
	const allPlansAdded = activeProducts.every((p) =>
		usedKeys.has(p.group ?? p.id),
	);
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

	const phaseHeader =
		!isExistingSchedule && isFirstPhase ? (
			<div className="flex h-input items-center gap-3 rounded-lg input-base input-shadow-default px-3 text-sm text-t1">
				<CalendarIcon className="size-3.5 shrink-0 text-t3 ml-1" />
				<span className="flex-1">Now</span>
				<Tooltip>
					<TooltipTrigger asChild>
						<InfoIcon
							size={13}
							className="shrink-0 text-t4 hover:text-t2 transition-colors cursor-default"
						/>
					</TooltipTrigger>
					<TooltipContent>
						The first phase of a schedule starts immediately
					</TooltipContent>
				</Tooltip>
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
							isDateLocked && "text-t3 border-border/70",
							phaseTimingError && "border-destructive",
						)}
					/>
					{!isFirstPhase && (
						<button
							type="button"
							onClick={() => handleRemovePhase({ phaseIndex })}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-t4 hover:text-destructive transition-colors opacity-0 group-hover/phase-date:opacity-100 disabled:pointer-events-none disabled:opacity-50"
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
						className="absolute left-[12px] bottom-2 z-10 size-[15px] rounded-full bg-card border border-border/60 text-t4 hover:text-t1 hover:border-primary hover:bg-card flex items-center justify-center opacity-0 group-hover/connector:opacity-100 transition-all duration-150"
					>
						<PlusIcon size={9} weight="bold" />
					</button>
				)}
				<div className="space-y-1.5">
					{phase.plans.map((p, planIndex) => (
						<SchedulePlanRow
							key={`plan-${phaseIndex}-${planIndex}-${p.productId ?? "empty"}`}
							phaseIndex={phaseIndex}
							planIndex={planIndex}
							usedKeys={usedKeys}
						/>
					))}
					<button
						type="button"
						className="flex items-center gap-1 text-xs text-t4 hover:text-t2 transition-colors py-1 disabled:opacity-40 disabled:pointer-events-none"
						onClick={() => handleAddPlan({ phaseIndex })}
						disabled={allPlansAdded || isLocked}
					>
						<PlusIcon size={11} />
						Add plan
					</button>
				</div>
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
