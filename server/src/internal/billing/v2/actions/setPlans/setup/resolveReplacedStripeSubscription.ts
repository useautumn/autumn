import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchPendingStripeSubscription } from "./fetchPendingStripeSubscription";
import { splitReplacedStripeSubscription } from "./splitReplacedStripeSubscription";

type StripeSubscriptionsForReplacement = Omit<
	Parameters<typeof splitReplacedStripeSubscription>[0],
	"pendingStripeSubscription"
>;

export const resolveReplacedStripeSubscription = async ({
	ctx,
	fullCustomer,
	stripeBillingContext,
	replaceUnusableSubscription,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	stripeBillingContext: StripeSubscriptionsForReplacement;
	replaceUnusableSubscription: boolean;
}) => {
	const { stripeSubscription, stripeSubscriptionSchedule } =
		stripeBillingContext;
	if (!replaceUnusableSubscription) {
		return {
			stripeSubscription,
			stripeSubscriptionSchedule,
			replacedStripeSubscription: undefined,
		};
	}

	const hasFetchedSubscription =
		stripeSubscription || stripeBillingContext.canceledStripeSubscription;
	const pendingStripeSubscription = hasFetchedSubscription
		? undefined
		: await fetchPendingStripeSubscription({ ctx, fullCustomer });

	return splitReplacedStripeSubscription({
		...stripeBillingContext,
		pendingStripeSubscription,
	});
};
