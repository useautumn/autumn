import {
	type BillingInterval,
	customerProductHasActiveStatus,
	customerProductToEffectivePrices,
	ErrCode,
	type FullCusProduct,
	formatInterval,
	getLargestInterval,
	isCustomerProductOnStripeSubscription,
	isCustomerProductPaidRecurring,
	RecaseError,
	type StripeSubscriptionScope,
} from "@autumn/shared";

type PlanInterval = { interval: BillingInterval; intervalCount: number };

const customerProductToInterval = (
	customerProduct: FullCusProduct,
): PlanInterval | null =>
	getLargestInterval({
		prices: customerProductToEffectivePrices({ customerProduct }),
		excludeOneOff: true,
	});

const intervalKey = ({ interval, intervalCount }: PlanInterval) =>
	`${interval}:${intervalCount}`;

/** New paid plans bill on the targeted subscription, so they must share the
 * interval of the plans that stay on it. Replacing every plan may change it. */
export const assertNoBillingIntervalMix = ({
	stripeSubscriptionScope,
	currentCustomerProducts,
	outgoingCustomerProducts,
	incomingCustomerProducts,
}: {
	stripeSubscriptionScope?: StripeSubscriptionScope;
	currentCustomerProducts: FullCusProduct[];
	outgoingCustomerProducts: FullCusProduct[];
	incomingCustomerProducts: FullCusProduct[];
}) => {
	if (!stripeSubscriptionScope) return;
	const { stripeSubscriptionId } = stripeSubscriptionScope;

	const outgoingIds = new Set(outgoingCustomerProducts.map(({ id }) => id));
	const remainingIntervals = currentCustomerProducts
		.filter(
			(customerProduct) =>
				!outgoingIds.has(customerProduct.id) &&
				customerProductHasActiveStatus(customerProduct) &&
				isCustomerProductPaidRecurring(customerProduct) &&
				isCustomerProductOnStripeSubscription({
					customerProduct,
					stripeSubscriptionId,
				}),
		)
		.map(customerProductToInterval)
		.filter((interval): interval is PlanInterval => interval !== null);
	const [subscriptionInterval] = remainingIntervals;
	if (!subscriptionInterval) return;

	const remainingKeys = new Set(remainingIntervals.map(intervalKey));
	for (const customerProduct of incomingCustomerProducts) {
		if (!isCustomerProductPaidRecurring(customerProduct)) continue;
		const incomingInterval = customerProductToInterval(customerProduct);
		if (!incomingInterval || remainingKeys.has(intervalKey(incomingInterval))) {
			continue;
		}

		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: `${customerProduct.product.name} is billed ${formatInterval(incomingInterval)}, but subscription ${stripeSubscriptionId} is billed ${formatInterval(subscriptionInterval)}. Plans on one subscription must share a billing interval.`,
			statusCode: 400,
		});
	}
};
