/** A backdate over a paid live subscription keeps its renewal date; a trialing one paid nothing, so its recreate takes an anchor. */
export const backdateAcceptsBillingCycleAnchor = ({
	liveSubscriptionTrialing,
}: {
	liveSubscriptionTrialing: boolean;
}) => liveSubscriptionTrialing;
