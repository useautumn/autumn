import type { CustomerStatePhase } from "@/components/forms/customer-state/customerStateSchema";

const PHASE_START = "phase_start";

/** The first phase resets its cycle when asked to; a later phase does unless it keeps the cycle anchor. */
export const phaseToBillingCycleAnchor = ({
	phase,
	isFirstPhase,
	resetBillingCycle,
}: {
	phase: Pick<CustomerStatePhase, "keepsCycleAnchor">;
	isFirstPhase: boolean;
	resetBillingCycle: boolean;
}): typeof PHASE_START | undefined => {
	const resets = isFirstPhase ? resetBillingCycle : !phase.keepsCycleAnchor;
	return resets ? PHASE_START : undefined;
};

export const billingCycleAnchorToKeepsCycleAnchor = ({
	billingCycleAnchor,
	isFirstPhase,
}: {
	billingCycleAnchor: unknown;
	isFirstPhase: boolean;
}): boolean => !isFirstPhase && billingCycleAnchor !== PHASE_START;
