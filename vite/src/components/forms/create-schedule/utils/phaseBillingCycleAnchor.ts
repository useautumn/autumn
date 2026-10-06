import type { CustomerStatePhase } from "@/components/forms/customer-state/customerStateSchema";

const PHASE_START = "phase_start";

/** The first phase resets its cycle when asked to, on a custom date if given; a later phase does unless it keeps the cycle anchor. */
export const phaseToBillingCycleAnchor = ({
	phase,
	isFirstPhase,
	resetBillingCycle,
	customAnchor,
}: {
	phase: Pick<CustomerStatePhase, "keepsCycleAnchor">;
	isFirstPhase: boolean;
	resetBillingCycle: boolean;
	customAnchor?: number | null;
}): typeof PHASE_START | number | undefined => {
	if (!isFirstPhase) return phase.keepsCycleAnchor ? undefined : PHASE_START;
	if (!resetBillingCycle) return undefined;
	return customAnchor ?? PHASE_START;
};

export const billingCycleAnchorToKeepsCycleAnchor = ({
	billingCycleAnchor,
	isFirstPhase,
}: {
	billingCycleAnchor: unknown;
	isFirstPhase: boolean;
}): boolean => !isFirstPhase && billingCycleAnchor !== PHASE_START;
