import type { Operations } from "@autumn/shared";
import { useCallback } from "react";
import type { StepId } from "../StepIndicator";
import { hasValidOperations } from "../shared/operationUtils";

const STEP_ORDER: StepId[] = ["filter", "operations", "live"];

export function useGuardedStepNavigation({
	step,
	hasCustomers,
	hasRuns,
	operations,
	saveError,
	enableErrorDisplay,
	setStep,
}: {
	step: StepId;
	hasCustomers: boolean;
	hasRuns: boolean;
	operations: Operations;
	saveError: string | null;
	enableErrorDisplay: () => void;
	setStep: (step: StepId) => void;
}) {
	return useCallback(
		(target: StepId) => {
			const currentIndex = STEP_ORDER.indexOf(step);
			const targetIndex = STEP_ORDER.indexOf(target);
			if (targetIndex <= currentIndex) return setStep(target);
			if (targetIndex >= 1 && !hasCustomers && !hasRuns) return;
			if (targetIndex >= 2 && (!hasValidOperations(operations) || !!saveError))
				return;
			if (targetIndex === 2) enableErrorDisplay();
			setStep(target);
		},
		[step, hasCustomers, hasRuns, operations, saveError, enableErrorDisplay, setStep],
	);
}
