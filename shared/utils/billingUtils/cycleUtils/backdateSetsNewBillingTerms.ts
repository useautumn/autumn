/**
 * A backdate over a trialing subscription paid nothing, so its recreate takes new billing terms: an anchor, and the
 * trial kept or turned off. A paid one continues the period it paid, keeping its renewal date and adding no trial.
 */
export const backdateSetsNewBillingTerms = ({
	liveSubscriptionTrialing,
}: {
	liveSubscriptionTrialing: boolean;
}) => liveSubscriptionTrialing;
