import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { isImmediatePhase } from "../../utils/schedulePhaseTiming";

export function PhaseActionsMenu({
	phaseIndex,
	hasStarted,
}: {
	phaseIndex: number;
	hasStarted: boolean;
}) {
	const { form, formValues, handleRemovePhase } = useCustomerStateContext();
	if (isImmediatePhase({ phaseIndex }) || hasStarted) return null;

	const keepsCycleAnchor =
		formValues.phases[phaseIndex]?.keepsCycleAnchor ?? false;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<IconButton
					aria-label="Phase actions"
					className="size-6 shrink-0 text-tertiary-foreground hover:text-foreground"
					icon={<DotsThreeIcon />}
					size="sm"
					type="button"
					variant="muted"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-44">
				<DropdownMenuCheckboxItem
					checked={keepsCycleAnchor}
					onCheckedChange={(checked) =>
						form.setFieldValue(
							`phases[${phaseIndex}].keepsCycleAnchor`,
							checked,
						)
					}
				>
					Keep cycle anchor
				</DropdownMenuCheckboxItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					onClick={() => handleRemovePhase({ phaseIndex })}
				>
					Delete phase
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
