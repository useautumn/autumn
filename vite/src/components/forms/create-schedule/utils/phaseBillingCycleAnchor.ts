import type { CustomerStatePhase } from "@/components/forms/customer-state/customerStateSchema";

const PHASE_START = "phase_start";

/** A later phase resets the billing cycle at its start unless it keeps the cycle anchor. */
export const phaseToBillingCycleAnchor = ({
	phase,
	isFirstPhase,
}: {
	phase: Pick<CustomerStatePhase, "keepsCycleAnchor">;
	isFirstPhase: boolean;
}): typeof PHASE_START | undefined => {
	if (isFirstPhase || phase.keepsCycleAnchor) return undefined;
	return PHASE_START;
};

export const billingCycleAnchorToKeepsCycleAnchor = ({
	billingCycleAnchor,
	isFirstPhase,
}: {
	billingCycleAnchor: unknown;
	isFirstPhase: boolean;
}): boolean => !isFirstPhase && billingCycleAnchor !== PHASE_START;
