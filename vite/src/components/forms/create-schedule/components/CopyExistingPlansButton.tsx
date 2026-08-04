import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { CopySimpleIcon, InfoIcon } from "@phosphor-icons/react";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { filterPlansByScope } from "../scheduleUtils";

/** Seeds the opening phase with the customer's current plans at this row's scope. */
export function CopyExistingPlansButton({
	phaseIndex,
	planIndex,
	entityId,
	scopeLabel,
}: {
	phaseIndex: number;
	planIndex: number;
	entityId: string | null;
	/** Absent when the customer has no entities, so scope isn't a choice. */
	scopeLabel?: string;
}) {
	const { formValues, existingPlans, handleCopyExistingPlans, isPhaseLocked } =
		useCreateScheduleFormContext();

	// Copying replaces the phase's plans, so only offer it while it's untouched.
	const hasPickedPlan = formValues.phases[phaseIndex]?.plans.some(
		(plan) => plan.productId,
	);
	const scopedPlans = filterPlansByScope({ plans: existingPlans, entityId });

	if (
		phaseIndex !== 0 ||
		scopedPlans.length === 0 ||
		hasPickedPlan ||
		isPhaseLocked({ phaseIndex })
	) {
		return null;
	}

	return (
		<div className="flex w-full items-center gap-2 border-b border-border/50 px-2 py-1.5 text-xs text-tertiary-foreground transition-colors hover:bg-interactive-secondary-hover">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-2"
				onClick={() => handleCopyExistingPlans({ planIndex, entityId })}
			>
				<CopySimpleIcon size={12} />
				Copy existing plans
			</button>
			{scopeLabel && (
				<Tooltip>
					<TooltipTrigger asChild>
						<InfoIcon
							size={13}
							className="shrink-0 cursor-default text-subtle transition-colors hover:text-muted-foreground"
						/>
					</TooltipTrigger>
					<TooltipContent>
						Copies from selected scope: {scopeLabel}
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
