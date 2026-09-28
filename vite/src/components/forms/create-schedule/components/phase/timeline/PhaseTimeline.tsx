import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { getCurrentCreateSchedulePhaseIndex } from "@/components/forms/customer-state/customerStateSchema";
import { SchedulePhaseCard } from "../../SchedulePhaseCard";
import { AddPhaseButton } from "../AddPhaseButton";
import { PhaseTimelineRail } from "./PhaseTimelineRail";
import { PhaseTimelineRow } from "./PhaseTimelineRow";

const MIN_PHASES_FOR_RAIL = 2;

/** Phases stacked in order, joined by a rail once there's more than one. */
export function PhaseTimeline() {
	const { formValues, nowMs, handleAddPhase } = useCustomerStateContext();
	const { phases } = formValues;

	const showsRail = phases.length >= MIN_PHASES_FOR_RAIL;
	const currentPhaseIndex =
		getCurrentCreateSchedulePhaseIndex({ phases, nowMs }) ?? 0;
	const lastPhaseIndex = phases.length - 1;

	return (
		<div className="flex flex-col">
			{phases.map((_phase, phaseIndex) => (
				<PhaseTimelineRow
					key={`phase-${phaseIndex}`}
					showsRail={showsRail}
					className="group/phase-row"
					rail={
						<PhaseTimelineRail
							phaseIndex={phaseIndex}
							isCurrent={phaseIndex === currentPhaseIndex}
							isLast={phaseIndex === lastPhaseIndex}
							connectsToNext
						/>
					}
				>
					<div className="pb-5">
						<SchedulePhaseCard phaseIndex={phaseIndex} />
					</div>
				</PhaseTimelineRow>
			))}
			<AddPhaseButton alignsWithRail={showsRail} onClick={handleAddPhase} />
		</div>
	);
}
