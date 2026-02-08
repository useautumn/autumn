import type { BillingContext } from "@autumn/shared";

/**
 * Check if the billing context will create a trial that ends later than the current epoch.
 * @param billingContext - The billing context.
 * @returns True if the billing context has a trial, false otherwise.
 */
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
