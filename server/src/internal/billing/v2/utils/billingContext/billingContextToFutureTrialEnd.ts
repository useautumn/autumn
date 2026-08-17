import type { BillingContext } from "@autumn/shared";

/**
 * The trial end while it's still ahead of us — the one case where billing
 * cannot begin at the natural cycle boundary, so cycle math floors on it.
 */
export const billingContextToFutureTrialEnd = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): number | undefined => {
	const { trialContext, currentEpochMs } = billingContext;
	const trialEndsAt = trialContext?.trialEndsAt;

	return trialEndsAt && trialEndsAt > currentEpochMs ? trialEndsAt : undefined;
};
