/** A trial anchors the cycle on its end, so no billing_cycle_anchor applies; a backdated trialing recreate anchors after the kept trial instead. */
export const trialAnchorsBillingCycle = ({
	hasTrial,
	backdatesTrialingSubscription,
}: {
	hasTrial: boolean;
	backdatesTrialingSubscription: boolean;
}) => hasTrial && !backdatesTrialingSubscription;

export const TRIAL_ANCHORS_BILLING_CYCLE_REASON =
	"The free trial sets the billing cycle. Turn the trial off to reset it.";
