import {
	IconButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { TrashIcon } from "@phosphor-icons/react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { isImmediatePhase } from "../../utils/review/phaseTiming";

export function PhaseDeleteButton({
	phaseIndex,
	hasStarted,
}: {
	phaseIndex: number;
	hasStarted: boolean;
}) {
	const { handleRemovePhase } = useCustomerStateContext();
	if (isImmediatePhase({ phaseIndex }) || hasStarted) return null;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<IconButton
					aria-label="Delete phase"
					className="size-6 shrink-0 text-tertiary-foreground hover:text-foreground"
					icon={<TrashIcon />}
					onClick={() => handleRemovePhase({ phaseIndex })}
					size="sm"
					type="button"
					variant="muted"
				/>
			</TooltipTrigger>
			<TooltipContent side="top">Delete phase</TooltipContent>
		</Tooltip>
	);
}
