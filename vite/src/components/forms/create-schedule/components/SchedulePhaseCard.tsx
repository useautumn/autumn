import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { CustomerStatePhasePlans } from "@/components/forms/customer-state/components/CustomerStatePhasePlans";
import { PhaseTrayHeader } from "./phase/PhaseTrayHeader";

const LOCKED_PHASE_MESSAGE = "This phase has passed and can't be edited.";

export function SchedulePhaseCard({ phaseIndex }: { phaseIndex: number }) {
	const { isPhaseLocked } = useCustomerStateContext();
	const phaseTray = (
		<CustomerStatePhasePlans
			phaseIndex={phaseIndex}
			header={<PhaseTrayHeader phaseIndex={phaseIndex} />}
		/>
	);

	if (!isPhaseLocked({ phaseIndex })) return phaseTray;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="opacity-75">{phaseTray}</div>
			</TooltipTrigger>
			<TooltipContent>{LOCKED_PHASE_MESSAGE}</TooltipContent>
		</Tooltip>
	);
}
