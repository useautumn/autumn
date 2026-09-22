import { truncateMsToSecondPrecision } from "@autumn/shared";

export const getRequestedBillingCycleAnchorResetAt = ({
	requestedBillingCycleAnchor,
}: {
	requestedBillingCycleAnchor?: number | "now";
}): number | undefined => {
	if (typeof requestedBillingCycleAnchor !== "number") return undefined;

	return truncateMsToSecondPrecision(requestedBillingCycleAnchor);
};
