import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { PLAN_SECTION_HEADER_CLASS } from "@/components/forms/customer-state/components/tray/PlanSection";
import {
	getPhaseTimingError,
	hasCreateSchedulePhaseStarted,
} from "@/components/forms/customer-state/customerStateSchema";
import { PhaseActionsMenu } from "./PhaseActionsMenu";
import { PhaseDateControl } from "./PhaseDateControl";

export function PhaseHeader({ phaseIndex }: { phaseIndex: number }) {
	const { formValues, nowMs, isPhaseLocked } = useCustomerStateContext();

	const isLocked = isPhaseLocked({ phaseIndex });
	const hasStarted = hasCreateSchedulePhaseStarted({
		phases: formValues.phases,
		phaseIndex,
		nowMs,
	});
	const timingError = getPhaseTimingError({
		phases: formValues.phases,
		phaseIndex,
		nowMs,
	});

	return (
		<div>
			<div className={PLAN_SECTION_HEADER_CLASS}>
				<div className="relative z-10">
					<PhaseDateControl
						phaseIndex={phaseIndex}
						hasStarted={hasStarted}
						isLocked={isLocked}
						hasTimingError={timingError !== null}
					/>
				</div>
				<span className="flex-1" />
				<PhaseActionsMenu phaseIndex={phaseIndex} hasStarted={hasStarted} />
			</div>
			{timingError && (
				<p className="pt-1 text-xs text-destructive">{timingError}</p>
			)}
		</div>
	);
}
