import { InlineAction } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { SchedulePhaseCard } from "../../SchedulePhaseCard";

export function PhaseTimeline() {
	const { formValues, handleAddPhase } = useCustomerStateContext();
	const lastPhaseIndex = formValues.phases.length - 1;

	return (
		<div className="flex flex-col">
			{formValues.phases.map((_phase, phaseIndex) => (
				<div key={`phase-${phaseIndex}`} className="relative pb-5 last:pb-0">
					{phaseIndex < lastPhaseIndex && (
						<span
							aria-hidden
							className="absolute top-4 -bottom-4 left-4 w-px -translate-x-1/2 bg-border"
						/>
					)}
					<SchedulePhaseCard phaseIndex={phaseIndex} />
				</div>
			))}
			<InlineAction
				icon={<PlusIcon size={11} />}
				onClick={handleAddPhase}
				className="mt-3"
			>
				Add phase
			</InlineAction>
		</div>
	);
}
