import type { BillingContext } from "@autumn/shared";

export const billingContextToFutureTrialEnd = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): number | undefined => {
	const { trialContext, currentEpochMs } = billingContext;
	const trialEndsAt = trialContext?.trialEndsAt;

	return trialEndsAt && trialEndsAt > currentEpochMs ? trialEndsAt : undefined;
};
