import {
	type BillingInterval,
	customerProductHasActiveStatus,
	customerProductToEffectivePrices,
	type FullCusProduct,
	formatInterval,
	getLargestInterval,
	isCustomerProductOnStripeSubscription,
	isCustomerProductPaidRecurring,
	type StripeSubscriptionScope,
} from "@autumn/shared";
import { setPlansError } from "../setPlansError";
import { stripeSubscriptionPlanName } from "./subscriptionScopeErrors";

type PlanInterval = { interval: BillingInterval; intervalCount: number };

const customerProductToInterval = (
	customerProduct: FullCusProduct,
): PlanInterval | null =>
	getLargestInterval({
		prices: customerProductToEffectivePrices({ customerProduct }),
		excludeOneOff: true,
	});

const BILLS_EVERY = "every ";

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

		throw setPlansError({
			details: {
				type: "billing_interval_mismatch",
				requested_plan_name: customerProduct.product.name,
				requested_interval: formatInterval({
					...incomingInterval,
					prefix: BILLS_EVERY,
				}),
				subscription_plan_name: stripeSubscriptionPlanName({
					customerProducts: currentCustomerProducts,
					stripeSubscriptionId,
				}),
				subscription_interval: formatInterval({
					...subscriptionInterval,
					prefix: BILLS_EVERY,
				}),
			},
		});
	}
};
