import { ConditionalTooltip } from "@autumn/ui";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { CustomerStatePhasePlans } from "@/components/forms/customer-state/components/CustomerStatePhasePlans";
import { cn } from "@/lib/utils";
import { PhaseHeader } from "./phase/PhaseHeader";

const LOCKED_PHASE_MESSAGE = "This phase has passed and can't be edited.";

export function SchedulePhaseCard({ phaseIndex }: { phaseIndex: number }) {
	const { isPhaseLocked } = useCustomerStateContext();
	const isLocked = isPhaseLocked({ phaseIndex });

	return (
		<ConditionalTooltip enabled={isLocked} content={LOCKED_PHASE_MESSAGE}>
			<div className={cn(isLocked && "opacity-75")}>
				<CustomerStatePhasePlans
					phaseIndex={phaseIndex}
					header={<PhaseHeader phaseIndex={phaseIndex} />}
					insetForRail
				/>
			</div>
		</ConditionalTooltip>
	);
}
