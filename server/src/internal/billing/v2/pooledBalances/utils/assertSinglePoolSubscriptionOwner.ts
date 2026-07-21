import {
	type DbPooledBalanceContribution,
	InternalError,
} from "@autumn/shared";

// One pool = one renewal clock: a second subscription joining an existing
// pool would double-roll every contribution on each sub's invoice.
export const assertSinglePoolSubscriptionOwner = ({
	pooledBalanceId,
	poolContributions,
	sourceCustomerProductId,
	stripeSubscriptionId,
}: {
	pooledBalanceId: string;
	poolContributions: Pick<
		DbPooledBalanceContribution,
		"source_customer_product_id" | "stripe_subscription_id"
	>[];
	sourceCustomerProductId: string;
	stripeSubscriptionId: string;
}) => {
	const conflicting = poolContributions.find(
		(contribution) =>
			contribution.stripe_subscription_id &&
			contribution.stripe_subscription_id !== stripeSubscriptionId &&
			contribution.source_customer_product_id !== sourceCustomerProductId,
	);
	if (conflicting) {
		throw new InternalError({
			message: `Pooled balance '${pooledBalanceId}' is renewed by subscription '${conflicting.stripe_subscription_id}'; source '${sourceCustomerProductId}' on '${stripeSubscriptionId}' cannot join it.`,
		});
	}
};
