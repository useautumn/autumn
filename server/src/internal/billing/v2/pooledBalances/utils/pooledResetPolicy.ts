/** Who renews a contribution: a Stripe subscription, a license parent
 * product, or nobody (free — the pool lazily resets on its own anchor). */
export type PooledResetPolicy =
	| { stripeSubscriptionId: string }
	| { customerLicenseLinkId: string }
	| { lazy: { anchor: number; now: number } };

export const pooledResetPolicyToContributionOwner = ({
	resetPolicy,
}: {
	resetPolicy: PooledResetPolicy;
}): {
	stripeSubscriptionId: string | null;
	customerLicenseLinkId: string | null;
} => ({
	stripeSubscriptionId:
		"stripeSubscriptionId" in resetPolicy
			? resetPolicy.stripeSubscriptionId
			: null,
	customerLicenseLinkId:
		"customerLicenseLinkId" in resetPolicy
			? resetPolicy.customerLicenseLinkId
			: null,
});
