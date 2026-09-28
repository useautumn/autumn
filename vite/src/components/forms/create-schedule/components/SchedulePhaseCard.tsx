import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { CustomerStatePhasePlans } from "@/components/forms/customer-state/components/CustomerStatePhasePlans";
import { PhaseHeader } from "./phase/PhaseHeader";

const LOCKED_PHASE_MESSAGE = "This phase has passed and can't be edited.";

export function SchedulePhaseCard({ phaseIndex }: { phaseIndex: number }) {
	const { isPhaseLocked } = useCustomerStateContext();
	const phasePlans = (
		<CustomerStatePhasePlans
			phaseIndex={phaseIndex}
			header={<PhaseHeader phaseIndex={phaseIndex} />}
		/>
	);

	if (!isPhaseLocked({ phaseIndex })) return phasePlans;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="opacity-75">{phasePlans}</div>
			</TooltipTrigger>
			<TooltipContent>{LOCKED_PHASE_MESSAGE}</TooltipContent>
		</Tooltip>
	);
}
