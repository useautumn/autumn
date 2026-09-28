import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { PLAN_TRAY_HEADER_CLASS } from "@/components/forms/customer-state/components/tray/PlanTray";
import {
	getPhaseTimingError,
	hasCreateSchedulePhaseStarted,
} from "@/components/forms/customer-state/customerStateSchema";
import { usePhaseRecurringTotal } from "../../hooks/usePhaseRecurringTotal";
import { PhaseActionsMenu } from "./PhaseActionsMenu";
import { PhaseDateControl } from "./PhaseDateControl";

export function PhaseTrayHeader({ phaseIndex }: { phaseIndex: number }) {
	const { formValues, nowMs, isPhaseLocked } = useCustomerStateContext();
	const recurringTotal = usePhaseRecurringTotal({ phaseIndex });

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
			<div className={PLAN_TRAY_HEADER_CLASS}>
				<PhaseDateControl
					phaseIndex={phaseIndex}
					hasStarted={hasStarted}
					isLocked={isLocked}
					hasTimingError={timingError !== null}
				/>
				<span className="flex-1" />
				{recurringTotal && (
					<span className="tabular-nums text-tertiary-foreground">
						{recurringTotal}
					</span>
				)}
				<PhaseActionsMenu
					phaseIndex={phaseIndex}
					hasStarted={hasStarted}
					isLocked={isLocked}
				/>
			</div>
			{timingError && (
				<p className="px-2 pb-1.5 text-xs text-destructive">{timingError}</p>
			)}
		</div>
	);
}
