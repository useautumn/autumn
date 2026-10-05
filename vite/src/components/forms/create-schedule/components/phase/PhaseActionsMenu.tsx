import { PhaseProrationBehaviorSchema } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import {
	CalendarBlankIcon,
	DotsThreeIcon,
	ReceiptIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { PRORATION_BEHAVIOR_LABELS } from "@/components/forms/shared/ProrationBehaviorConfigRow";
import { isImmediatePhase } from "../../utils/schedulePhaseTiming";

const PHASE_PRORATION_BEHAVIORS = PhaseProrationBehaviorSchema.options;

export function PhaseActionsMenu({
	phaseIndex,
	hasStarted,
}: {
	phaseIndex: number;
	hasStarted: boolean;
}) {
	const { form, formValues, handleRemovePhase } = useCustomerStateContext();
	if (isImmediatePhase({ phaseIndex }) || hasStarted) return null;

	const phase = formValues.phases[phaseIndex];
	const keepsCycleAnchor = phase?.keepsCycleAnchor ?? false;
	const prorationBehavior =
		phase?.prorationBehavior ??
		(keepsCycleAnchor ? "prorate_immediately" : "none");

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
					<CalendarBlankIcon className="size-4" />
					Keep cycle anchor
				</DropdownMenuCheckboxItem>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<ReceiptIcon className="size-4" />
						Proration
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						<DropdownMenuRadioGroup
							value={prorationBehavior}
							onValueChange={(value) =>
								form.setFieldValue(
									`phases[${phaseIndex}].prorationBehavior`,
									PhaseProrationBehaviorSchema.parse(value),
								)
							}
						>
							{PHASE_PRORATION_BEHAVIORS.map((behavior) => (
								<DropdownMenuRadioItem key={behavior} value={behavior}>
									{PRORATION_BEHAVIOR_LABELS[behavior]}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					onClick={() => handleRemovePhase({ phaseIndex })}
				>
					<TrashIcon className="size-4" />
					Delete phase
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
