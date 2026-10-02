import { truncateMsToSecondPrecision } from "@autumn/shared";

/** Stripe stores phase starts in whole seconds, so the anchor matches its phase start to the second. */
export const phaseResetsBillingCycle = ({
	billingCycleAnchorResetsAt,
	phaseStartsAt,
}: {
	billingCycleAnchorResetsAt: number | null | undefined;
	phaseStartsAt: number;
}) =>
	billingCycleAnchorResetsAt != null &&
	truncateMsToSecondPrecision(billingCycleAnchorResetsAt) ===
		truncateMsToSecondPrecision(phaseStartsAt);
