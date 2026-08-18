import { truncateMsToSecondPrecision } from "@autumn/shared";

export const getRequestedBillingCycleAnchorResetAt = ({
	requestedBillingCycleAnchor,
}: {
	requestedBillingCycleAnchor?: number | "now";
}): number | undefined => {
	if (typeof requestedBillingCycleAnchor !== "number") return undefined;

	return truncateMsToSecondPrecision(requestedBillingCycleAnchor);
};

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
