import { CopySimpleIcon } from "@phosphor-icons/react";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

/** Seeds the opening phase with the customer's current plans. */
export function CopyExistingPlansButton({
	phaseIndex,
}: {
	phaseIndex: number;
}) {
	const { formValues, existingPlans, handleCopyExistingPlans, isPhaseLocked } =
		useCreateScheduleFormContext();

	// Copying replaces the phase's plans, so only offer it while it's untouched.
	const hasPickedPlan = formValues.phases[phaseIndex]?.plans.some(
		(plan) => plan.productId,
	);

	if (
		phaseIndex !== 0 ||
		existingPlans.length === 0 ||
		hasPickedPlan ||
		isPhaseLocked({ phaseIndex })
	) {
		return null;
	}

	return (
		<button
			type="button"
			className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-tertiary-foreground hover:bg-interactive-secondary-hover transition-colors border-b border-border/50"
			onClick={handleCopyExistingPlans}
		>
			<CopySimpleIcon size={12} />
			Copy existing plans
		</button>
	);
}
