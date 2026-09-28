import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { SchedulePhaseCard } from "../../SchedulePhaseCard";
import { AddPhaseButton } from "../AddPhaseButton";

export function PhaseTimeline() {
	const { formValues, handleAddPhase } = useCustomerStateContext();

	return (
		<div className="relative flex flex-col">
			<span
				aria-hidden
				className="absolute top-4 bottom-4 left-4 w-px -translate-x-1/2 bg-border"
			/>
			{formValues.phases.map((_phase, phaseIndex) => (
				<div key={`phase-${phaseIndex}`} className="pb-5">
					<SchedulePhaseCard phaseIndex={phaseIndex} />
				</div>
			))}
			<AddPhaseButton onClick={handleAddPhase} />
		</div>
	);
}
