import {
	BillingInterval,
	compareBillingIntervals,
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

const customerProductToRecurringIntervals = (
	customerProduct: FullCusProduct,
): PlanInterval[] =>
	customerProductToEffectivePrices({ customerProduct })
		.filter(({ config }) => config.interval !== BillingInterval.OneOff)
		.map(({ config }) => ({
			interval: config.interval,
			intervalCount: config.interval_count ?? 1,
		}));

const BILLS_EVERY = "every ";

const isWeekly = ({ interval }: PlanInterval) =>
	interval === BillingInterval.Week;

/** Quarter ×1 and month ×3 are the same Stripe recurrence; four weeks is not a month. */
const isSameRecurrence = ({
	first,
	second,
}: {
	first: PlanInterval;
	second: PlanInterval;
}) =>
	isWeekly(first) === isWeekly(second) &&
	compareBillingIntervals({ configA: first, configB: second }) === 0;

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
	const remainingCustomerProducts = currentCustomerProducts.filter(
		(customerProduct) =>
			!outgoingIds.has(customerProduct.id) &&
			customerProductHasActiveStatus(customerProduct) &&
			isCustomerProductPaidRecurring(customerProduct) &&
			isCustomerProductOnStripeSubscription({
				customerProduct,
				stripeSubscriptionId,
			}),
	);
	const [subscriptionInterval] = remainingCustomerProducts
		.map(customerProductToInterval)
		.filter((interval): interval is PlanInterval => interval !== null);
	if (!subscriptionInterval) return;

	const remainingIntervals = remainingCustomerProducts.flatMap(
		customerProductToRecurringIntervals,
	);
	for (const customerProduct of incomingCustomerProducts) {
		if (!isCustomerProductPaidRecurring(customerProduct)) continue;
		const incomingInterval = customerProductToInterval(customerProduct);
		const sharesRemainingInterval =
			!incomingInterval ||
			remainingIntervals.some((interval) =>
				isSameRecurrence({ first: interval, second: incomingInterval }),
			);
		if (sharesRemainingInterval) {
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
