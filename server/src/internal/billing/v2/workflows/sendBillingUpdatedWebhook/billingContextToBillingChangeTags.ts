import type { BillingContext } from "@autumn/shared";

/**
 * Tags for `billing.updated` describing what an action did when the plan diff
 * alone doesn't convey it. A pause and a resume are both status-only changes,
 * so the tag is what tells a consumer which one happened.
 */
export const billingContextToBillingChangeTags = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): string[] | undefined => {
	const { pauseAction } = billingContext;

	if (!pauseAction) return undefined;

	return [pauseAction === "pause" ? "paused" : "resumed"];
};
