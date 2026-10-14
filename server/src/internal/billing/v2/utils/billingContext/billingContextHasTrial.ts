import type { BillingContext } from "@autumn/shared";

export const billingContextHasTrial = ({
	billingContext,
	isTrialing,
}: {
	billingContext: BillingContext;
	isTrialing: boolean;
}) => {
	const { currentEpochMs, trialContext } = billingContext;

	if (trialContext?.trialEndsAt && trialContext.trialEndsAt > currentEpochMs) {
		return true;
	}

	if (trialContext?.trialEndsAt === null) {
		return false;
	}

	return isTrialing;
};
