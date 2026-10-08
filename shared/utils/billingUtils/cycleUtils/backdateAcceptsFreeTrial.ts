/** A backdate over a trialing subscription can keep or end its trial; a paid one continues the period it paid, with no trial. */
export const backdateAcceptsFreeTrial = ({
	liveSubscriptionTrialing,
}: {
	liveSubscriptionTrialing: boolean;
}) => liveSubscriptionTrialing;
