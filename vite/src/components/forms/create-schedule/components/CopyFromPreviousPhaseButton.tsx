import { CopySimpleIcon } from "@phosphor-icons/react";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

export function CopyFromPreviousPhaseButton({
	phaseIndex,
}: {
	phaseIndex: number;
}) {
	const { formValues, handleCopyFromPreviousPhase, isPhaseLocked } =
		useCreateScheduleFormContext();

	const previousPhase = formValues.phases[phaseIndex - 1];
	const hasPreviousPlans = previousPhase?.plans.some((p) => p.productId);

	if (phaseIndex < 1 || !hasPreviousPlans || isPhaseLocked({ phaseIndex })) {
		return null;
	}

	return (
		<button
			type="button"
			className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-t3 hover:bg-interactive-secondary-hover transition-colors border-b border-border/50"
			onClick={() => handleCopyFromPreviousPhase({ phaseIndex })}
		>
			<CopySimpleIcon size={12} />
			Copy from previous phase
		</button>
	);
}
