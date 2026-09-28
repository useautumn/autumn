export const clampNextResetAtToPendingBillingCycleAnchor = ({
	billingCycleAnchorResetsAt,
	currentEpochMs,
	nextResetAt,
}: {
	billingCycleAnchorResetsAt?: number | null;
	currentEpochMs: number;
	nextResetAt: number;
}) =>
	typeof billingCycleAnchorResetsAt === "number" &&
	billingCycleAnchorResetsAt > currentEpochMs
		? Math.min(nextResetAt, billingCycleAnchorResetsAt)
		: nextResetAt;
