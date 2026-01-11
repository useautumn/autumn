import type { BillingContext } from "@/internal/billing/v2/billingContext";

/**
 * Check if the billing context will create a trial that ends later than the current epoch.
 * @param billingContext - The billing context.
 * @returns True if the billing context has a trial, false otherwise.
 */
export const billingContextHasTrial = ({
	billingContext,
}: {
	billingContext: BillingContext;
}) => {
	const { currentEpochMs, trialContext } = billingContext;

	if (trialContext?.trialEndsAt && trialContext.trialEndsAt > currentEpochMs) {
		return true;
	}

	return false;
};
